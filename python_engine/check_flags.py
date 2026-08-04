#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Проверяет какие флаги из EngineConfig отсутствуют в FLAG_GROUPS UI
"""

import re
from pathlib import Path

# Читаем EngineConfig
engine_file = Path("D:/WORK/CLIENTS/mmss-meta-crystal/python_engine/metacrystal_engine_v7.py")
engine_content = engine_file.read_text(encoding='utf-8')

# Извлекаем флаги из EngineConfig
engine_flags = set()
flag_pattern = r'"([^"]+)":\s*(True|False)'
for match in re.finditer(flag_pattern, engine_content):
    if match.group(1).startswith('enable_'):
        engine_flags.add(match.group(1))

print(f"Флаги в EngineConfig ({len(engine_flags)}):")
for f in sorted(engine_flags):
    print(f"  {f}")

# Читаем FLAG_GROUPS из UI
ui_file = Path("D:/WORK/CLIENTS/mmss-meta-crystal/src/lib/profile-presets.ts")
ui_content = ui_file.read_text(encoding='utf-8')

# Извлекаем флаги из FLAG_GROUPS
ui_flags = set()
flag_pattern_ui = r'"(enable_[^"]+)"'
for match in re.finditer(flag_pattern_ui, ui_content):
    ui_flags.add(match.group(1))

print(f"\nФлаги в UI FLAG_GROUPS ({len(ui_flags)}):")
for f in sorted(ui_flags):
    print(f"  {f}")

# Находим отсутствующие
missing = engine_flags - ui_flags
print(f"\nОтсутствующие в UI ({len(missing)}):")
for f in sorted(missing):
    print(f"  {f}")

# Находим лишние
extra = ui_flags - engine_flags
print(f"\nЛишние в UI ({len(extra)}):")
for f in sorted(extra):
    print(f"  {f}")
