#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт импорта кристаллов из exported JSON файлов в базу данных.
Дедупликация по уникальному полю code.
Поддерживает импорт нескольких файлов с пропуском дубликатов.
"""

import json
import sqlite3
import sys
import uuid
from pathlib import Path
from typing import Dict, List, Set
from datetime import datetime

# Пути
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

EXPORT_DIR = Path("D:/WORK/CLIENTS/mmss-meta-crystal/z-ai-reference-crystal-pool-demo/exported")

def load_export_file(filepath: Path) -> dict:
    """Загружает JSON файл экспорта."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_existing_crystal_codes(conn: sqlite3.Connection) -> Set[str]:
    """Получает все существующие коды кристаллов."""
    cursor = conn.execute("SELECT code FROM Crystal")
    return {row[0] for row in cursor.fetchall()}

def map_crystal_data(export_crystal: dict, source_file: str) -> dict:
    """Преобразует данные из формата экспорта в формат БД."""
    metrics = export_crystal.get('metrics', {})
    
    # Формируем metadata
    metadata = {
        'source': source_file,
        'export_name': export_crystal.get('name'),
        'microNotes': export_crystal.get('microNotes'),
        'translation': export_crystal.get('translation'),
        'autoAnnotation': export_crystal.get('autoAnnotation'),
        'tags': export_crystal.get('tags', []),
        'torusX': export_crystal.get('torusX'),
        'torusY': export_crystal.get('torusY'),
        'torusZ': export_crystal.get('torusZ'),
        'clusterLabel': export_crystal.get('clusterLabel'),
        'isEmerald': export_crystal.get('isEmerald', False)
    }
    
    # Определяем тип на основе категории
    category = export_crystal.get('category', 'unknown')
    type_map = {
        'fractal': 'ФРАКТАЛ',
        'principle': 'ПРИНЦИП',
        'hybrid': 'ГИБРИД',
        'quantum': 'КВАНТОВЫЙ',
        'diamond': 'АЛМАЗ',
        'emerald': 'ИЗУМРУД'
    }
    crystal_type = type_map.get(category, category.upper())
    
    # Формируем searchText для embedding
    formula = export_crystal.get('formula', '')
    pattern = export_crystal.get('pattern', '')
    search_text = f"{formula} {pattern} {category}"
    
    return {
        'id': f"{uuid.uuid4().hex}",
        'code': export_crystal.get('code'),
        'type': crystal_type,
        'category': category,
        'focus': None,  # Нет в экспорте
        'pattern': pattern,
        'combination': formula,
        'searchText': search_text,
        'elementsJson': json.dumps([]),  # Нет в экспорте
        'operatorsJson': None,
        'metricsJson': json.dumps(metrics),
        'reasonsJson': json.dumps([export_crystal.get('microNotes', '')]),
        'qualityScore': export_crystal.get('qualityScore'),
        'complexity': export_crystal.get('complexity'),
        'counter': 0,
        'step': None,
        'filepath': f"imported/{source_file}",
        'embedding': None,
        'isFavourite': 0,
        'ghostCoordinate': None,
        'ghostTrajectory': None,
        'metadataJson': json.dumps(metadata),
        'createdAt': datetime.fromisoformat(export_crystal.get('createdAt', datetime.now().isoformat())).isoformat()
    }

def import_crystal(conn: sqlite3.Connection, crystal_data: dict, existing_codes: Set[str], stats: dict):
    """Импортирует один кристалл с проверкой дубликатов."""
    code = crystal_data['code']

    if code in existing_codes:
        stats['skipped'] += 1
        return False

    # Создаем кристалл
    conn.execute(
        """INSERT INTO Crystal (id, code, type, category, focus, pattern, combination,
           searchText, elementsJson, operatorsJson, metricsJson, reasonsJson,
           qualityScore, complexity, counter, step, filepath, embedding,
           isFavourite, ghostCoordinate, ghostTrajectory, metadataJson, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            crystal_data['id'],
            crystal_data['code'],
            crystal_data['type'],
            crystal_data['category'],
            crystal_data['focus'],
            crystal_data['pattern'],
            crystal_data['combination'],
            crystal_data['searchText'],
            crystal_data['elementsJson'],
            crystal_data['operatorsJson'],
            crystal_data['metricsJson'],
            crystal_data['reasonsJson'],
            crystal_data['qualityScore'],
            crystal_data['complexity'],
            crystal_data['counter'],
            crystal_data['step'],
            crystal_data['filepath'],
            crystal_data['embedding'],
            crystal_data['isFavourite'],
            crystal_data['ghostCoordinate'],
            crystal_data['ghostTrajectory'],
            crystal_data['metadataJson'],
            crystal_data['createdAt']
        )
    )
    stats['added'] += 1
    existing_codes.add(code)
    return True

def import_export_file(conn: sqlite3.Connection, filepath: Path, existing_codes: Set[str], stats: dict):
    """Импортирует один файл экспорта."""
    print(f"\nОбработка файла: {filepath.name}")

    data = load_export_file(filepath)
    crystals = data.get('crystals', [])
    total_in_file = len(crystals)

    print(f"  Кристаллов в файле: {total_in_file}")

    file_stats = {'added': 0, 'skipped': 0}

    for crystal in crystals:
        crystal_data = map_crystal_data(crystal, filepath.name)
        import_crystal(conn, crystal_data, existing_codes, file_stats)

    stats['added'] += file_stats['added']
    stats['skipped'] += file_stats['skipped']
    stats['files'] += 1

    print(f"  Добавлено: {file_stats['added']}, пропущено: {file_stats['skipped']}")

def main():
    print("=== Импорт кристаллов из exported файлов ===")

    # Проверка директории
    if not EXPORT_DIR.exists():
        print(f"Ошибка: директория не найдена: {EXPORT_DIR}")
        sys.exit(1)

    # Проверка БД
    if not DB_PATH.exists():
        print(f"Ошибка: БД не найдена: {DB_PATH}")
        sys.exit(1)

    # Получаем все JSON файлы
    export_files = sorted(EXPORT_DIR.glob("crystals_export_*.json"))
    print(f"Найдено файлов: {len(export_files)}")

    if not export_files:
        print("Файлы экспорта не найдены")
        sys.exit(1)

    # Подключение к БД
    conn = sqlite3.connect(DB_PATH)

    try:
        # Получаем существующие коды
        print("Проверка существующих кристаллов...")
        existing_codes = get_existing_crystal_codes(conn)
        print(f"Существующих кристаллов: {len(existing_codes)}")

        # Статистика
        stats = {'added': 0, 'skipped': 0, 'files': 0}

        # Импорт файлов
        for filepath in export_files:
            import_export_file(conn, filepath, existing_codes, stats)

        # Commit изменений
        conn.commit()

        print(f"\n=== Итоги ===")
        print(f"Файлов обработано: {stats['files']}")
        print(f"Новых кристаллов добавлено: {stats['added']}")
        print(f"Пропущено (дубликаты): {stats['skipped']}")
        print(f"Всего кристаллов в БД: {len(existing_codes)}")

    finally:
        conn.close()

if __name__ == '__main__':
    main()
