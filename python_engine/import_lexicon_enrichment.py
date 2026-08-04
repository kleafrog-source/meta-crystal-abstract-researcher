#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт импорта расширенного лексикона из deepseek_json snapshot в базу данных.
Дедупликация по уникальности [kind, name] в KnowledgeEntity.
"""

import json
import sqlite3
import sys
from pathlib import Path
from typing import Dict, List, Set

# Пути к файлам
MAIN_PROJECT = Path("D:/WORK/CLIENTS/mmss-meta-crystal")
# Проверяем возможные расположения БД
possible_db_paths = [
    MAIN_PROJECT / "prisma" / "dev.db",
    MAIN_PROJECT / "db" / "custom.db",
    MAIN_PROJECT / "dev.db"
]

DB_PATH = None
for path in possible_db_paths:
    if path.exists():
        DB_PATH = path
        break

if DB_PATH is None:
    print("База данных не найдена ни в одном из ожидаемых расположений:")
    for path in possible_db_paths:
        print(f"  - {path}")
    sys.exit(1)

LEXICON_SOURCE = Path("D:/WORK/CLIENTS/mmss-meta-crystal/z-ai-reference-crystal-pool-demo/meta_crystals/snapshots/deepseek_json_20260729_abdc46.json")

def load_lexicon(source_path: Path) -> Dict[str, List[str]]:
    """Загружает лексикон из JSON файла."""
    with open(source_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data.get('lexicon', {})

def get_existing_entities(conn: sqlite3.Connection, kind: str) -> Set[str]:
    """Получает существующие имена сущностей заданного типа."""
    cursor = conn.execute(
        "SELECT name FROM KnowledgeEntity WHERE kind = ?",
        (kind,)
    )
    return {row[0] for row in cursor.fetchall()}

def import_lexicon_category(conn: sqlite3.Connection, category: str, terms: List[str],
                            existing: Set[str], stats: dict):
    """Импортирует одну категорию лексикона."""
    kind = 'lexicon'
    added = 0
    skipped = 0

    for term in terms:
        if term in existing:
            skipped += 1
            continue

        # Создаем запись
        meta = {
            'category': category,
            'definition': f'Термин из категории лексикона: {category}'
        }

        # Генерируем CUID для id
        import uuid
        entity_id = f"{uuid.uuid4().hex}"

        conn.execute(
            """INSERT INTO KnowledgeEntity (id, kind, name, category, metaJson, embedding, createdAt)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))""",
            (entity_id, kind, term, category, json.dumps(meta, ensure_ascii=False), None)
        )
        added += 1
        existing.add(term)
    
    stats['added'] += added
    stats['skipped'] += skipped
    stats['categories'] += 1
    
    print(f"  Категория '{category}': +{added} новых, пропущено {skipped}")

def main():
    print("=== Импорт расширенного лексикона ===")

    # Проверка файлов
    if not LEXICON_SOURCE.exists():
        print(f"Ошибка: файл лексикона не найден: {LEXICON_SOURCE}")
        sys.exit(1)

    # Проверка БД
    if not DB_PATH.exists():
        print(f"Ошибка: БД не найдена: {DB_PATH}")
        sys.exit(1)

    # Загрузка лексикона
    print(f"Загрузка лексикона из: {LEXICON_SOURCE}")
    lexicon = load_lexicon(LEXICON_SOURCE)
    print(f"Загружено категорий: {len(lexicon)}")

    # Подключение к БД
    conn = sqlite3.connect(DB_PATH)

    try:
        # Получаем существующие записи
        print("Проверка существующих записей...")
        existing = get_existing_entities(conn, 'lexicon')
        print(f"Существующих записей lexicon: {len(existing)}")

        # Статистика
        stats = {'added': 0, 'skipped': 0, 'categories': 0}

        # Импорт категорий
        print("\nИмпорт категорий:")
        for category, terms in lexicon.items():
            import_lexicon_category(conn, category, terms, existing, stats)

        # Commit изменений
        conn.commit()

        print(f"\n=== Итоги ===")
        print(f"Категорий обработано: {stats['categories']}")
        print(f"Новых терминов добавлено: {stats['added']}")
        print(f"Пропущено (уже существуют): {stats['skipped']}")

    finally:
        conn.close()

if __name__ == '__main__':
    main()
