#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Удаляет импортированные кристаллы из БД
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
cursor = conn.cursor()

# Сначала проверяем сколько кристаллов будет удалено
cursor.execute("SELECT COUNT(*) FROM Crystal WHERE filepath LIKE 'imported/%'")
count = cursor.fetchone()[0]
print(f"Найдено импортированных кристаллов: {count}")

if count > 0:
    # Удаляем
    cursor.execute("DELETE FROM Crystal WHERE filepath LIKE 'imported/%'")
    conn.commit()
    print(f"Удалено {cursor.rowcount} кристаллов")

    # Проверяем оставшееся количество
    cursor.execute("SELECT COUNT(*) FROM Crystal")
    remaining = cursor.fetchone()[0]
    print(f"Осталось кристаллов в БД: {remaining}")
else:
    print("Импортированные кристаллы не найдены")

conn.close()
