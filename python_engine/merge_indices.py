#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Скрипт для объединения двух index.json файлов из разных копий приложения.
Сливает записи, удаляет дубликаты по полю (counter, code),
пересчитывает статистику и сохраняет новый index.json.
"""

import json
from pathlib import Path
from datetime import datetime

def merge_indices(file1: Path, file2: Path, output_file: Path = None):
    """
    Объединяет два index.json файла.
    Если output_file не указан, сохраняет как merged_index.json
    """
    if not output_file:
        output_file = Path("merged_index.json")

    # Загружаем оба индекса
    with open(file1, 'r', encoding='utf-8') as f:
        index1 = json.load(f)
    with open(file2, 'r', encoding='utf-8') as f:
        index2 = json.load(f)

    # Объединяем записи, используя множество для дедупликации по (counter, code)
    seen = set()
    merged_records = []

    for rec in index1.get("records", []) + index2.get("records", []):
        key = (rec.get("counter"), rec.get("code"))
        if key not in seen:
            seen.add(key)
            merged_records.append(rec)

    # Пересчитываем статистику
    by_type = {}
    by_category = {}
    for rec in merged_records:
        t = rec.get("type", "unknown")
        c = rec.get("category", "unknown")
        by_type[t] = by_type.get(t, 0) + 1
        by_category[c] = by_category.get(c, 0) + 1

    stats = {
        "total": len(merged_records),
        "by_type": by_type,
        "by_category": by_category,
        "last_update": datetime.now().isoformat(),
    }

    merged_index = {
        "stats": stats,
        "records": merged_records,
    }

    # Сохраняем
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(merged_index, f, ensure_ascii=False, indent=2)

    print(f"✅ Объединённый индекс сохранён в {output_file}")
    print(f"   Всего записей: {len(merged_records)}")
    print(f"   По типам: {by_type}")
    print(f"   По категориям: {by_category}")

    return output_file

if __name__ == "__main__":
    # Пример использования:
    merge_indices(
        Path("meta_crystals/crystals/meta/index2.json"),      # первый индекс
        Path("meta_crystals/crystals/meta/index5.json"),  # второй индекс
        Path("meta_crystals/crystals/meta/index.json") # результат
    )