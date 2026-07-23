#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
МОДУЛЬ ИМПОРТА/ЭКСПОРТА v2.0 (IMPORT ENGINE)
=============================================
Версия 2.0 — полностью переписана для бесконфликтного слияния.

Ключевые улучшения:
- Дедупликация сущностей перед применением
- Версионное слияние: старые данные не перезаписываются,
  новые добавляются с уникальными именами при конфликте
- Snapshot текущего состояния базы перед импортом (для отката)
- Подробный diff-предпросмотр: что добавится, что обновится,
  что будет пропущено (с указанием конфликтов)
- Идемпотентность: повторный импорт того же файла не дублирует
- Поддержка всех 4 категорий: lexicon, operators, patterns, focus

Формат JSON-импорта:
{
  "version": "2.0",
  "source": "user_upload",
  "lexicon":     {"new_category": ["term1", "term2"]},
  "operators":   {"op_key": {"symbol": "X", "type": "math", ...}},
  "patterns":    [{"name": "...", "template": "...", "complexity": 1}],
  "focus":       {"FocusType.NAME": ["word1", "word2"]}
}
"""

import os
import json
import re
import shutil
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Union, Set, Tuple
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


# ============================================================
# 1. КЛАССЫ ДАННЫХ
# ============================================================

@dataclass
class ImportableEntity:
    """Одна импортируемая сущность."""
    category: str   # lexicon | operators | patterns | focus
    name: str
    value: Any
    description: str = ""

    def to_dict(self) -> Dict:
        return {
            "category": self.category, "name": self.name,
            "value": self.value, "description": self.description,
        }

    @classmethod
    def from_dict(cls, d: Dict) -> "ImportableEntity":
        return cls(
            category=d.get("category", ""),
            name=d.get("name", ""),
            value=d.get("value"),
            description=d.get("description", ""),
        )


@dataclass
class ImportBatch:
    """Контейнер для пакета импортируемых сущностей."""
    source_file: str
    entities: List[ImportableEntity] = field(default_factory=list)
    format: str = "json"
    total: int = 0
    valid: int = 0
    errors: List[str] = field(default_factory=list)


@dataclass
class DiffEntry:
    """Одна запись diff-предпросмотра (что произойдёт при применении)."""
    action: str          # "add" | "update" | "skip" | "conflict"
    category: str
    key: str
    old_value: Any = None
    new_value: Any = None
    reason: str = ""


@dataclass
class ApplyResult:
    """Результат применения батча."""
    lexicon_added: int = 0
    lexicon_updated: int = 0
    lexicon_skipped: int = 0
    operators_added: int = 0
    operators_updated: int = 0
    operators_skipped: int = 0
    patterns_added: int = 0
    patterns_updated: int = 0
    patterns_skipped: int = 0
    focus_added: int = 0
    focus_updated: int = 0
    focus_skipped: int = 0
    conflicts: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    snapshot_path: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "lexicon_added": self.lexicon_added,
            "lexicon_updated": self.lexicon_updated,
            "lexicon_skipped": self.lexicon_skipped,
            "operators_added": self.operators_added,
            "operators_updated": self.operators_updated,
            "operators_skipped": self.operators_skipped,
            "patterns_added": self.patterns_added,
            "patterns_updated": self.patterns_updated,
            "patterns_skipped": self.patterns_skipped,
            "focus_added": self.focus_added,
            "focus_updated": self.focus_updated,
            "focus_skipped": self.focus_skipped,
            "conflicts": list(self.conflicts),
            "errors": list(self.errors),
            "snapshot_path": self.snapshot_path,
        }


# ============================================================
# 2. МЕНЕДЖЕР ИМПОРТА v2.0 (CONFLICT-SAFE)
# ============================================================

class ImportManager:
    """Главный класс для бесконфликтного импорта сущностей.

    Особенности v2.0:
    - create_snapshot() — сохраняет текущее состояние базы в JSON-файл
      (для возможности отката)
    - compute_diff(batch) — возвращает список DiffEntry, показывающий
      точно, что будет добавлено/обновлено/пропущено/конфликтовано
    - apply_batch(batch, merge_mode) — применяет батч с одним из режимов:
        * "add" — только добавлять новое, существующие пропускать (БЕЗОПАСНО)
        * "update" — обновлять существующие, новые добавлять
        * "replace" — полная замена (только для целых категорий)
        * "skip_duplicates" — то же, что "add", но с явным указанием
    - rollback(snapshot_path) — восстанавливает базу из снапшота
    """

    SUPPORTED_FORMATS = ("json", "text")
    MERGE_MODES = ("add", "update", "replace", "skip_duplicates")

    def __init__(self, base_dir: Union[str, Path],
                 LEXICON: Dict[str, List[str]],
                 OPERATORS: Dict[str, Dict],
                 STRUCTURAL_PATTERNS: List[Dict],
                 FOCUS_LEXICON: Dict):
        self.base_dir = Path(base_dir)
        self.LEXICON = LEXICON
        self.OPERATORS = OPERATORS
        self.STRUCTURAL_PATTERNS = STRUCTURAL_PATTERNS
        self.FOCUS_LEXICON = FOCUS_LEXICON
        # Папка для снапшотов
        self.snapshots_dir = self.base_dir / "meta_crystals" / "snapshots"
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------
    # ЗАГРУЗКА ИЗ ФАЙЛА
    # ---------------------------------------------------------
    def load_file(self, filepath: Union[str, Path]) -> ImportBatch:
        """Загружает файл и возвращает ImportBatch.

        Автоопределение: .json → JSON, .txt/.csv/.md → текст
        """
        filepath = Path(filepath)
        if not filepath.exists():
            raise FileNotFoundError(f"Файл не найден: {filepath}")

        ext = filepath.suffix.lower()
        try:
            if ext == ".json":
                return self._load_json(filepath)
            elif ext in (".txt", ".csv", ".md"):
                return self._load_text(filepath)
            else:
                content = filepath.read_text(encoding="utf-8", errors="replace")
                stripped = content.lstrip()
                if stripped.startswith("{") or stripped.startswith("["):
                    return self._load_json(filepath)
                return self._load_text(filepath)
        except Exception as e:
            logger.exception("Ошибка загрузки %s: %s", filepath, e)
            return ImportBatch(
                source_file=str(filepath), entities=[], format="unknown",
                total=0, valid=0, errors=[f"Ошибка загрузки: {e}"],
            )

    def _load_json(self, filepath: Path) -> ImportBatch:
        """Парсит JSON-файл."""
        try:
            data = json.loads(filepath.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            return ImportBatch(
                source_file=str(filepath), entities=[], format="json",
                total=0, valid=0, errors=[f"Некорректный JSON: {e}"],
            )

        entities: List[ImportableEntity] = []
        errors: List[str] = []

        # Раздел lexicon
        lexicon = data.get("lexicon", {})
        if isinstance(lexicon, dict):
            for cat, items in lexicon.items():
                if not isinstance(items, list):
                    errors.append(f"lexicon['{cat}'] должен быть списком")
                    continue
                for item in items:
                    if isinstance(item, str):
                        entities.append(ImportableEntity(
                            category="lexicon", name=item, value=cat,
                            description=f"Категория: {cat}"))
                    elif isinstance(item, dict) and "name" in item:
                        entities.append(ImportableEntity(
                            category="lexicon", name=item["name"], value=cat,
                            description=item.get("description", "")))
        else:
            errors.append("Раздел 'lexicon' должен быть объектом")

        # Раздел operators
        operators = data.get("operators", {})
        if isinstance(operators, dict):
            for key, spec in operators.items():
                if not isinstance(spec, dict):
                    errors.append(f"operators['{key}'] должен быть объектом")
                    continue
                if "symbol" not in spec:
                    errors.append(f"operators['{key}']: нет поля 'symbol'")
                    continue
                entities.append(ImportableEntity(
                    category="operators", name=key, value=spec,
                    description=spec.get("description", "")))
        elif isinstance(operators, list):
            for op in operators:
                if isinstance(op, dict) and "key" in op and "spec" in op:
                    entities.append(ImportableEntity(
                        category="operators", name=op["key"], value=op["spec"],
                        description=op.get("description", "")))

        # Раздел patterns
        patterns = data.get("patterns", [])
        if isinstance(patterns, list):
            for pat in patterns:
                if not isinstance(pat, dict):
                    continue
                if "name" not in pat:
                    errors.append("patterns: пропущено поле 'name'")
                    continue
                if "template" not in pat:
                    errors.append(f"patterns['{pat.get('name')}']: нет 'template'")
                    continue
                entities.append(ImportableEntity(
                    category="patterns", name=pat["name"], value=pat,
                    description=f"Шаблон: {pat.get('template', '')[:60]}"))

        # Раздел focus
        focus = data.get("focus", {})
        if isinstance(focus, dict):
            for focus_key, words in focus.items():
                if not isinstance(words, list):
                    errors.append(f"focus['{focus_key}'] должен быть списком")
                    continue
                for word in words:
                    if isinstance(word, str):
                        entities.append(ImportableEntity(
                            category="focus", name=focus_key, value=word,
                            description=f"Фокус: {focus_key}"))

        return ImportBatch(
            source_file=str(filepath), entities=entities, format="json",
            total=len(entities) + len(errors), valid=len(entities),
            errors=errors,
        )

    def _load_text(self, filepath: Path) -> ImportBatch:
        """Простой текст: одно слово на строку. Все идут в категорию 'user_terms'."""
        content = filepath.read_text(encoding="utf-8", errors="replace")
        lines = content.splitlines()
        entities: List[ImportableEntity] = []
        errors: List[str] = []
        seen: Set[str] = set()

        for i, raw_line in enumerate(lines, 1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if "," in line:
                line = line.split(",")[0].strip()
            if "\t" in line:
                line = line.split("\t")[0].strip()
            if not line:
                continue
            if len(line) > 100:
                errors.append(f"Строка {i}: слишком длинная, пропущена")
                continue
            if line in seen:
                continue
            seen.add(line)
            entities.append(ImportableEntity(
                category="lexicon", name=line, value="user_terms",
                description=f"Из {filepath.name}, строка {i}"))

        return ImportBatch(
            source_file=str(filepath), entities=entities, format="text",
            total=len(lines), valid=len(entities), errors=errors,
        )

    # ---------------------------------------------------------
    # ПРЕДПРОСМОТР (с детальным diff)
    # ---------------------------------------------------------
    def preview_batch(self, batch: ImportBatch) -> Dict:
        """Стандартный предпросмотр (как в v1.0)."""
        groups: Dict[str, List[Dict]] = {
            "lexicon": [], "operators": [], "patterns": [], "focus": [],
        }
        for e in batch.entities:
            groups.setdefault(e.category, []).append({
                "name": e.name, "value": e.value, "description": e.description,
            })
        return {
            "source": batch.source_file, "format": batch.format,
            "total": batch.total, "valid": batch.valid,
            "errors": list(batch.errors), "groups": groups,
        }

    def compute_diff(self, batch: ImportBatch) -> List[DiffEntry]:
        """Возвращает детальный diff: что произойдёт при apply.

        Для каждой сущности в батче возвращается DiffEntry с action:
        - "add": новый элемент, будет добавлен
        - "update": существующий, будет обновлён (только в режиме update/replace)
        - "skip": существующий, будет пропущен (в режиме add/skip_duplicates)
        - "conflict": имя занято, но значение отличается — требует решения
        """
        diff: List[DiffEntry] = []
        for e in batch.entities:
            entry = self._compute_diff_for_entity(e)
            diff.append(entry)
        return diff

    def _compute_diff_for_entity(self, e: ImportableEntity) -> DiffEntry:
        """Вычисляет diff для одной сущности."""
        if e.category == "lexicon":
            return self._diff_lexicon(e)
        elif e.category == "operators":
            return self._diff_operator(e)
        elif e.category == "patterns":
            return self._diff_pattern(e)
        elif e.category == "focus":
            return self._diff_focus(e)
        return DiffEntry(action="skip", category=e.category, key=e.name,
                          reason=f"Неизвестная категория: {e.category}")

    def _diff_lexicon(self, e: ImportableEntity) -> DiffEntry:
        term = e.name
        category = e.value if isinstance(e.value, str) else str(e.value)

        # Проверяем, существует ли уже этот термин в любой категории
        for cat, items in self.LEXICON.items():
            if term in items:
                if cat == category:
                    return DiffEntry(action="skip", category="lexicon",
                                      key=f"{cat}/{term}",
                                      reason="Термин уже в этой категории")
                else:
                    return DiffEntry(action="conflict", category="lexicon",
                                      key=f"{cat}/{term}",
                                      old_value=cat, new_value=category,
                                      reason=f"Термин уже в категории '{cat}', пытаемся добавить в '{category}'")

        if category not in self.LEXICON:
            return DiffEntry(action="add", category="lexicon",
                              key=f"{category}/{term}",
                              new_value=term,
                              reason="Новая категория будет создана")
        return DiffEntry(action="add", category="lexicon",
                          key=f"{category}/{term}",
                          new_value=term, reason="Новый термин")

    def _diff_operator(self, e: ImportableEntity) -> DiffEntry:
        key = e.name
        spec = e.value if isinstance(e.value, dict) else {}
        if key in self.OPERATORS:
            existing = self.OPERATORS[key]
            # Сравниваем symbol — если совпадает, можно обновить
            if existing.get("symbol") == spec.get("symbol"):
                return DiffEntry(action="update", category="operators",
                                  key=key, old_value=existing, new_value=spec,
                                  reason="Оператор существует, можно обновить")
            else:
                return DiffEntry(action="conflict", category="operators",
                                  key=key, old_value=existing, new_value=spec,
                                  reason=f"Ключ занят, symbol отличается: '{existing.get('symbol')}' vs '{spec.get('symbol')}'")
        return DiffEntry(action="add", category="operators",
                          key=key, new_value=spec, reason="Новый оператор")

    def _diff_pattern(self, e: ImportableEntity) -> DiffEntry:
        name = e.name
        pat = e.value if isinstance(e.value, dict) else {}
        for p in self.STRUCTURAL_PATTERNS:
            if p.get("name") == name:
                if p.get("template") == pat.get("template"):
                    return DiffEntry(action="update", category="patterns",
                                      key=name, old_value=p, new_value=pat,
                                      reason="Паттерн существует, можно обновить")
                else:
                    return DiffEntry(action="conflict", category="patterns",
                                      key=name, old_value=p, new_value=pat,
                                      reason="Имя занято, шаблон отличается")
        return DiffEntry(action="add", category="patterns",
                          key=name, new_value=pat, reason="Новый паттерн")

    def _diff_focus(self, e: ImportableEntity) -> DiffEntry:
        focus_key = e.name
        word = e.value if isinstance(e.value, str) else str(e.value)
        if focus_key.startswith("FocusType."):
            focus_key_clean = focus_key[len("FocusType."):]
        else:
            focus_key_clean = focus_key

        target_list = None
        actual_key = focus_key
        if focus_key in self.FOCUS_LEXICON:
            target_list = self.FOCUS_LEXICON[focus_key]
            actual_key = focus_key
        else:
            for k, v in self.FOCUS_LEXICON.items():
                k_str = k.name if hasattr(k, "name") else str(k)
                if k_str == focus_key_clean:
                    target_list = v
                    actual_key = k
                    break

        if target_list is None:
            return DiffEntry(action="add", category="focus",
                              key=focus_key, new_value=word,
                              reason="Будет создан новый ключ фокуса")

        if word in target_list:
            return DiffEntry(action="skip", category="focus",
                              key=f"{focus_key}/{word}",
                              reason="Слово уже в этом фокусе")
        return DiffEntry(action="add", category="focus",
                          key=f"{focus_key}/{word}",
                          new_value=word, reason="Новое слово в существующий фокус")

    # ---------------------------------------------------------
    # СНАПШОТЫ (для отката)
    # ---------------------------------------------------------
    def create_snapshot(self, label: str = "") -> Path:
        """Сохраняет текущее состояние базы в JSON-файл.

        Возвращает путь к снапшоту. Снапшот можно использовать для отката
        через rollback().
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_label = re.sub(r"[^a-zA-Z0-9_]", "_", label)[:32] if label else "auto"
        snap_file = self.snapshots_dir / f"snap_{timestamp}_{safe_label}.json"

        # Нормализуем FOCUS_LEXICON (ключи-enum → строки)
        focus_export = {}
        for k, v in self.FOCUS_LEXICON.items():
            key_str = k.name if hasattr(k, "name") else str(k)
            focus_export[key_str] = list(v) if isinstance(v, list) else list(v)

        data = {
            "snapshot_created": datetime.now().isoformat(),
            "label": label,
            "lexicon": {k: list(v) for k, v in self.LEXICON.items()},
            "operators": {k: dict(v) for k, v in self.OPERATORS.items()},
            "patterns": [dict(p) for p in self.STRUCTURAL_PATTERNS],
            "focus": focus_export,
            "stats": self.get_stats(),
        }
        snap_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8"
        )
        return snap_file

    def rollback(self, snapshot_path: Union[str, Path]) -> bool:
        """Восстанавливает базу из снапшота."""
        snapshot_path = Path(snapshot_path)
        if not snapshot_path.exists():
            return False
        try:
            data = json.loads(snapshot_path.read_text(encoding="utf-8"))

            # Внимание: мы заменяем содержимое in-place, не пересоздавая dict
            # (т.к. на него ссылаются другие объекты)
            self.LEXICON.clear()
            self.LEXICON.update(data.get("lexicon", {}))

            self.OPERATORS.clear()
            self.OPERATORS.update(data.get("operators", {}))

            self.STRUCTURAL_PATTERNS.clear()
            self.STRUCTURAL_PATTERNS.extend(data.get("patterns", []))

            # FOCUS_LEXICON сложнее: ключи могут быть enum
            self.FOCUS_LEXICON.clear()
            for k, v in data.get("focus", {}).items():
                self.FOCUS_LEXICON[k] = list(v)
            return True
        except Exception as e:
            logger.exception("Ошибка отката: %s", e)
            return False

    def list_snapshots(self) -> List[Dict]:
        """Возвращает список доступных снапшотов."""
        snaps = []
        for f in sorted(self.snapshots_dir.glob("snap_*.json"), reverse=True):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                snaps.append({
                    "path": str(f),
                    "name": f.name,
                    "label": data.get("label", ""),
                    "created": data.get("snapshot_created", ""),
                    "stats": data.get("stats", {}),
                })
            except Exception:
                continue
        return snaps

    # ---------------------------------------------------------
    # ПРИМЕНЕНИЕ (CONFLICT-SAFE)
    # ---------------------------------------------------------
    def apply_batch(self, batch: ImportBatch, merge_mode: str = "add",
                     create_snapshot: bool = True) -> Dict:
        """Применяет батч к базе. Conflict-safe.

        :param batch: батч для применения
        :param merge_mode:
            "add"             — добавлять новое, существующие пропускать
            "update"          — обновлять существующие, новые добавлять
            "replace"         — заменять (с подтверждением конфликтов)
            "skip_duplicates" — то же, что "add", но с явным логированием
        :param create_snapshot: если True — создаёт снапшот перед изменениями
        :return: dict с детальной статистикой
        """
        if merge_mode not in self.MERGE_MODES:
            raise ValueError(f"Неизвестный merge_mode: {merge_mode}")

        snap_path = None
        if create_snapshot:
            try:
                snap_path = self.create_snapshot(label=f"before_import_{merge_mode}")
            except Exception as e:
                logger.warning("Не удалось создать снапшот: %s", e)

        result = ApplyResult(snapshot_path=str(snap_path) if snap_path else None)

        # Дедупликация внутри батча (на случай дубликатов в исходнике)
        seen_keys: Set[Tuple[str, str]] = set()
        deduped_entities = []
        for e in batch.entities:
            key = (e.category, e.name)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            deduped_entities.append(e)

        for entity in deduped_entities:
            try:
                if entity.category == "lexicon":
                    self._apply_lexicon(entity, merge_mode, result)
                elif entity.category == "operators":
                    self._apply_operator(entity, merge_mode, result)
                elif entity.category == "patterns":
                    self._apply_pattern(entity, merge_mode, result)
                elif entity.category == "focus":
                    self._apply_focus(entity, merge_mode, result)
                else:
                    result.errors.append(f"Неизвестная категория: {entity.category}")
            except Exception as e:
                result.errors.append(f"Ошибка {entity.category}/{entity.name}: {e}")
                logger.exception("Ошибка применения: %s", entity)

        return result.to_dict()

    def _apply_lexicon(self, entity: ImportableEntity, merge_mode: str, result: ApplyResult):
        """Применяет lexicon-сущность. Conflict-safe."""
        term = entity.name
        category = entity.value if isinstance(entity.value, str) else str(entity.value)

        # Проверяем, не существует ли термин уже в КАКОЙ-ЛИБО категории
        existing_cat = None
        for cat, items in self.LEXICON.items():
            if term in items:
                existing_cat = cat
                break

        if existing_cat is not None:
            if existing_cat == category:
                # Уже в этой категории — пропускаем
                result.lexicon_skipped += 1
                return
            # Конфликт: термин в другой категории
            if merge_mode in ("add", "skip_duplicates"):
                # Безопасный режим: пропускаем, логируем
                result.conflicts.append(
                    f"lexicon: '{term}' уже в '{existing_cat}', пропуск (хотели в '{category}')")
                result.lexicon_skipped += 1
                return
            elif merge_mode == "update":
                # Перемещаем из старой категории в новую
                self.LEXICON[existing_cat].remove(term)
                if category not in self.LEXICON:
                    self.LEXICON[category] = []
                self.LEXICON[category].append(term)
                result.lexicon_updated += 1
                return
            elif merge_mode == "replace":
                # Полная замена
                self.LEXICON[existing_cat].remove(term)
                if category not in self.LEXICON:
                    self.LEXICON[category] = []
                self.LEXICON[category].append(term)
                result.lexicon_updated += 1
                return

        # Новое
        if category not in self.LEXICON:
            self.LEXICON[category] = []
        self.LEXICON[category].append(term)
        result.lexicon_added += 1

    def _apply_operator(self, entity: ImportableEntity, merge_mode: str, result: ApplyResult):
        """Применяет operators-сущность. Conflict-safe."""
        key = entity.name
        spec = entity.value if isinstance(entity.value, dict) else {}
        spec.setdefault("symbol", key[:3])
        spec.setdefault("type", "custom")
        spec.setdefault("arity", 1)
        spec.setdefault("priority", 4)

        if key in self.OPERATORS:
            existing = self.OPERATORS[key]
            if existing.get("symbol") == spec.get("symbol"):
                # Тот же символ — можно обновить
                if merge_mode in ("update", "replace"):
                    self.OPERATORS[key] = spec
                    result.operators_updated += 1
                else:
                    result.operators_skipped += 1
                return
            # Конфликт: ключ занят, символ отличается
            if merge_mode == "replace":
                self.OPERATORS[key] = spec
                result.operators_updated += 1
            else:
                # Безопасно: создаём новый ключ с суффиксом
                new_key = f"{key}_v2"
                while new_key in self.OPERATORS:
                    new_key = new_key + "_x"
                self.OPERATORS[new_key] = spec
                result.conflicts.append(
                    f"operators: ключ '{key}' занят (symbol='{existing.get('symbol')}'), "
                    f"создан '{new_key}'")
                result.operators_added += 1
            return

        self.OPERATORS[key] = spec
        result.operators_added += 1

    def _apply_pattern(self, entity: ImportableEntity, merge_mode: str, result: ApplyResult):
        """Применяет patterns-сущность. Conflict-safe."""
        name = entity.name
        pat = entity.value if isinstance(entity.value, dict) else {}
        pat.setdefault("name", name)
        pat.setdefault("template", "{A} {op} {B}")
        pat.setdefault("complexity", 1)

        existing_idx = None
        for i, p in enumerate(self.STRUCTURAL_PATTERNS):
            if p.get("name") == name:
                existing_idx = i
                break

        if existing_idx is not None:
            existing = self.STRUCTURAL_PATTERNS[existing_idx]
            if existing.get("template") == pat.get("template"):
                if merge_mode in ("update", "replace"):
                    self.STRUCTURAL_PATTERNS[existing_idx] = pat
                    result.patterns_updated += 1
                else:
                    result.patterns_skipped += 1
                return
            # Конфликт: имя занято, шаблон отличается
            if merge_mode == "replace":
                self.STRUCTURAL_PATTERNS[existing_idx] = pat
                result.patterns_updated += 1
            else:
                new_name = f"{name}_v2"
                while any(p.get("name") == new_name for p in self.STRUCTURAL_PATTERNS):
                    new_name = new_name + "_x"
                pat["name"] = new_name
                self.STRUCTURAL_PATTERNS.append(pat)
                result.conflicts.append(
                    f"patterns: имя '{name}' занято, создан '{new_name}'")
                result.patterns_added += 1
            return

        self.STRUCTURAL_PATTERNS.append(pat)
        result.patterns_added += 1

    def _apply_focus(self, entity: ImportableEntity, merge_mode: str, result: ApplyResult):
        """Применяет focus-сущность. Conflict-safe."""
        focus_key = entity.name
        word = entity.value if isinstance(entity.value, str) else str(entity.value)

        if focus_key.startswith("FocusType."):
            focus_key_clean = focus_key[len("FocusType."):]
        else:
            focus_key_clean = focus_key

        target_list = None
        actual_key = focus_key
        if focus_key in self.FOCUS_LEXICON:
            target_list = self.FOCUS_LEXICON[focus_key]
        else:
            for k, v in self.FOCUS_LEXICON.items():
                k_str = k.name if hasattr(k, "name") else str(k)
                if k_str == focus_key_clean:
                    target_list = v
                    actual_key = k
                    break

        if target_list is None:
            self.FOCUS_LEXICON[focus_key] = [word]
            result.focus_added += 1
            return

        if word in target_list:
            result.focus_skipped += 1
            return

        target_list.append(word)
        result.focus_added += 1

    # ---------------------------------------------------------
    # ЭКСПОРТ
    # ---------------------------------------------------------
    def export_to_json(self, filepath: Union[str, Path],
                        include: Optional[List[str]] = None) -> Dict:
        """Экспортирует текущее состояние базы в JSON."""
        filepath = Path(filepath)
        include = include or ["lexicon", "operators", "patterns", "focus"]

        data = {
            "version": "2.0",
            "source": "export",
            "exported_at": datetime.now().isoformat(),
        }

        if "lexicon" in include:
            data["lexicon"] = {k: list(v) for k, v in self.LEXICON.items()}
        if "operators" in include:
            data["operators"] = {k: dict(v) for k, v in self.OPERATORS.items()}
        if "patterns" in include:
            data["patterns"] = [dict(p) for p in self.STRUCTURAL_PATTERNS]
        if "focus" in include:
            focus_export = {}
            for k, v in self.FOCUS_LEXICON.items():
                key_str = k.name if hasattr(k, "name") else str(k)
                focus_export[key_str] = list(v) if isinstance(v, list) else list(v)
            data["focus"] = focus_export

        try:
            filepath.write_text(
                json.dumps(data, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8"
            )
            return {
                "filepath": str(filepath),
                "lexicon_categories": len(data.get("lexicon", {})),
                "operators": len(data.get("operators", {})),
                "patterns": len(data.get("patterns", [])),
                "focus_categories": len(data.get("focus", {})),
                "errors": [],
            }
        except Exception as e:
            return {"filepath": str(filepath), "errors": [str(e)]}

    # ---------------------------------------------------------
    # ДОБАВЛЕНИЕ ОДИНОЧНЫХ СУЩНОСТЕЙ
    # ---------------------------------------------------------
    def add_lexicon_term(self, category: str, term: str,
                          description: str = "") -> bool:
        if category not in self.LEXICON:
            self.LEXICON[category] = []
        if term in self.LEXICON[category]:
            return False
        # Также проверяем, нет ли термина в другой категории
        for cat, items in self.LEXICON.items():
            if term in items:
                return False
        self.LEXICON[category].append(term)
        return True

    def add_operator(self, key: str, spec: Dict, description: str = "") -> bool:
        if key in self.OPERATORS:
            return False
        spec.setdefault("symbol", key[:3])
        spec.setdefault("type", "custom")
        spec.setdefault("arity", 1)
        spec.setdefault("priority", 4)
        if description and "description" not in spec:
            spec["description"] = description
        self.OPERATORS[key] = spec
        return True

    def add_pattern(self, name: str, template: str, complexity: int = 1) -> bool:
        for p in self.STRUCTURAL_PATTERNS:
            if p.get("name") == name:
                return False
        self.STRUCTURAL_PATTERNS.append({
            "name": name, "template": template, "complexity": complexity,
        })
        return True

    def add_focus_word(self, focus_key: str, word: str) -> bool:
        target = None
        if focus_key in self.FOCUS_LEXICON:
            target = self.FOCUS_LEXICON[focus_key]
        else:
            for k, v in self.FOCUS_LEXICON.items():
                k_str = k.name if hasattr(k, "name") else str(k)
                if k_str == focus_key:
                    target = v
                    break
        if target is None:
            self.FOCUS_LEXICON[focus_key] = [word]
            return True
        if word in target:
            return False
        target.append(word)
        return True

    # ---------------------------------------------------------
    # СТАТИСТИКА
    # ---------------------------------------------------------
    def get_stats(self) -> Dict:
        return {
            "lexicon_categories": len(self.LEXICON),
            "lexicon_terms_total": sum(len(v) for v in self.LEXICON.values()),
            "operators": len(self.OPERATORS),
            "patterns": len(self.STRUCTURAL_PATTERNS),
            "focus_categories": len(self.FOCUS_LEXICON),
            "focus_words_total": sum(len(v) for v in self.FOCUS_LEXICON.values()
                                      if isinstance(v, list)),
        }


# ============================================================
# 3. УТИЛИТЫ
# ============================================================

def make_empty_batch(source: str = "<empty>") -> ImportBatch:
    return ImportBatch(source_file=source, entities=[], format="empty",
                        total=0, valid=0, errors=[])


def merge_batches(*batches: ImportBatch) -> ImportBatch:
    """Объединяет несколько батчей в один (с дедупликацией)."""
    seen_keys: Set[Tuple[str, str]] = set()
    all_entities: List[ImportableEntity] = []
    all_errors: List[str] = []
    sources = []
    fmt = "json"
    for b in batches:
        for e in b.entities:
            key = (e.category, e.name)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            all_entities.append(e)
        all_errors.extend(b.errors)
        sources.append(b.source_file)
        if b.format != "json":
            fmt = b.format
    return ImportBatch(
        source_file=" + ".join(sources),
        entities=all_entities, format=fmt,
        total=len(all_entities) + len(all_errors),
        valid=len(all_entities), errors=all_errors,
    )


# ============================================================
# 4. ТОЧКА ВХОДА
# ============================================================

if __name__ == "__main__":
    import sys
    base = Path(__file__).resolve().parent
    sys.path.insert(0, str(base))

    try:
        from metacrystal_engine_v7 import LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON
    except ImportError as e:
        print(f"❌ Не удалось импортировать движок: {e}")
        sys.exit(1)

    mgr = ImportManager(base, LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON)
    print("=== Статистика базы ===")
    for k, v in mgr.get_stats().items():
        print(f"  {k}: {v}")

    # Демонстрация diff и безопасного импорта
    print("\n=== Демонстрация conflict-safe импорта ===")
    batch = ImportBatch(
        source_file="<демо>",
        entities=[
            ImportableEntity("lexicon", "демо_термин", "демо_категория"),
            ImportableEntity("lexicon", "математика", "другая_категория"),  # конфликт
            ImportableEntity("operators", "demo_op",
                              {"symbol": "∂∂", "type": "math", "arity": 1, "priority": 4}),
        ],
        format="json", total=3, valid=3, errors=[],
    )
    print("Diff:")
    for d in mgr.compute_diff(batch):
        print(f"  [{d.action:8s}] {d.category}/{d.key}: {d.reason}")

    print("\nApply (mode=add):")
    result = mgr.apply_batch(batch, merge_mode="add", create_snapshot=True)
    for k, v in result.items():
        print(f"  {k}: {v}")

    print(f"\nФинальная статистика: {mgr.get_stats()}")
    print(f"\nСнапшоты: {len(mgr.list_snapshots())}")
