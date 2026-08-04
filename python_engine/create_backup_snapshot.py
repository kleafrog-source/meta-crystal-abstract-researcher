#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Скрипт создания бэкап-снапшота базы данных перед импортом.
Сохраняет копию dev.db и создает JSON snapshot основных таблиц.
"""

import json
import sqlite3
import shutil
from pathlib import Path
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

BACKUP_DIR = MAIN_PROJECT / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

def create_db_backup():
    """Создает копию файла базы данных."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"dev_backup_{timestamp}.db"
    backup_path = BACKUP_DIR / backup_name
    
    print(f"Создание копии БД: {backup_path}")
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ БД скопирована: {backup_path}")
    return backup_path

def create_json_snapshot():
    """Создает JSON snapshot основных таблиц."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshot_name = f"snapshot_{timestamp}.json"
    snapshot_path = BACKUP_DIR / snapshot_name
    
    print(f"Создание JSON snapshot: {snapshot_path}")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    snapshot = {
        'created_at': datetime.now().isoformat(),
        'label': 'before_enrichment_import',
        'tables': {}
    }
    
    # Snapshot основных таблиц
    tables = ['Crystal', 'KnowledgeEntity', 'Profile', 'Snapshot']
    
    for table in tables:
        try:
            cursor = conn.execute(f"SELECT * FROM {table}")
            rows = [dict(row) for row in cursor.fetchall()]
            snapshot['tables'][table] = {
                'count': len(rows),
                'data': rows
            }
            print(f"  {table}: {len(rows)} записей")
        except sqlite3.OperationalError as e:
            print(f"  {table}: таблица не существует ({e})")
            snapshot['tables'][table] = {'count': 0, 'data': []}
    
    conn.close()
    
    with open(snapshot_path, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    
    print(f"✅ JSON snapshot создан: {snapshot_path}")
    return snapshot_path

def main():
    print("=== Создание бэкапа перед импортом ===")
    print(f"Используется БД: {DB_PATH}\n")
    
    # Создание бэкапов
    db_backup = create_db_backup()
    json_snapshot = create_json_snapshot()
    
    print(f"\n=== Бэкап завершен ===")
    print(f"DB backup: {db_backup}")
    print(f"JSON snapshot: {json_snapshot}")
    print(f"\nДля отката:")
    print(f"1. Скопировать {db_backup} в {DB_PATH}")
    print(f"2. Или восстановить из JSON snapshot")

if __name__ == '__main__':
    main()
