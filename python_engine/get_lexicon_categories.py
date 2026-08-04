#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Получает категории лексикона из БД для обновления EngineConfig
"""

import sqlite3
from pathlib import Path

MAIN_PROJECT = Path("D:/WORK/CLIENTS/mmss-meta-crystal")
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
    print("База данных не найдена")
    exit(1)

conn = sqlite3.connect(DB_PATH)
cursor = conn.execute('SELECT DISTINCT category FROM KnowledgeEntity WHERE kind="lexicon" ORDER BY category')
categories = [row[0] for row in cursor.fetchall()]
conn.close()

print("Категории лексикона:")
for cat in categories:
    print(f'  "{cat}",')
