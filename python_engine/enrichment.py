#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
МОДУЛЬ ОБОГАЩЕНИЯ БАЗЫ ДАННЫХ (ENRICHMENT)
============================================
Предоставляет инструменты для автоматического и полуавтоматического
пополнения LEXICON, OPERATORS, STRUCTURAL_PATTERNS новыми сущностями.

Возможности:
- Извлечение терминов из текста (с помощью простых эвристик или через локальную LLM)
- Генерация новых операторов на основе анализа существующих кристаллов
- Создание новых паттернов из часто встречающихся структур
- Обогащение из внешних источников (ArXiv, Wikipedia, Google Books) — заглушка для API
- Ручное добавление через GUI (интеграция с import_engine)

Все функции используют import_engine для применения изменений.
"""

import re
import json
import random
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
from collections import Counter
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# ============================================================
# 1. БАЗОВЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ТЕКСТАМИ
# ============================================================

class TermExtractor:
    """Извлекает ключевые термины из текста."""

    # Стоп-слова для фильтрации (русские и английские)
    STOP_WORDS = {
        'и', 'в', 'на', 'с', 'по', 'к', 'у', 'о', 'а', 'но', 'за', 'из', 'от', 'до',
        'для', 'при', 'без', 'через', 'над', 'под', 'об', 'про', 'же', 'бы', 'не',
        'ни', 'что', 'это', 'так', 'все', 'его', 'ее', 'их', 'кто', 'где', 'когда',
        'the', 'and', 'or', 'of', 'to', 'for', 'with', 'on', 'at', 'from', 'by',
        'in', 'without', 'through', 'about', 'but', 'so', 'then', 'now', 'more'
    }

    @classmethod
    def extract_phrases(cls, text: str, min_len: int = 3, max_len: int = 6,
                        min_freq: int = 1) -> List[str]:
        """
        Извлекает n-граммы из текста (простейший метод).
        Возвращает список уникальных фраз (строки).
        """
        # Очистка текста
        text = re.sub(r'[^а-яА-Яa-zA-Z0-9\s\-]', ' ', text)
        words = text.lower().split()

        # Удаляем стоп-слова и короткие слова
        filtered = [w for w in words if len(w) >= 3 and w not in cls.STOP_WORDS]

        phrases = []
        # Извлекаем n-граммы для n от min_len до max_len
        for n in range(min_len, max_len + 1):
            for i in range(len(filtered) - n + 1):
                phrase = ' '.join(filtered[i:i+n])
                # Отфильтровываем слишком длинные фразы (> 60 символов)
                if len(phrase) <= 60:
                    phrases.append(phrase)

        # Считаем частоты и отбираем те, которые встречаются >= min_freq раз
        if min_freq > 1:
            counter = Counter(phrases)
            return [p for p, cnt in counter.items() if cnt >= min_freq]
        else:
            # Возвращаем все уникальные
            return list(set(phrases))

    @classmethod
    def extract_entities(cls, text: str) -> List[str]:
        """
        Извлекает именованные сущности (заглушка; можно заменить на SpaCy).
        Возвращает список слов/фраз, похожих на термины.
        """
        # Простейший метод: ищем слова с большой буквы (для русских и английских)
        patterns = [
            r'\b[А-Я][а-я]+\b',  # русские имена/термины
            r'\b[A-Z][a-z]+\b',  # английские
            r'\b[А-Я][А-Я]*\b',  # аббревиатуры
        ]
        result = []
        for pat in patterns:
            matches = re.findall(pat, text)
            result.extend(matches)
        # Фильтруем по длине и стоп-словам
        return [w for w in result if len(w) >= 3 and w.lower() not in cls.STOP_WORDS]


# ============================================================
# 2. ОБОГАЩЕНИЕ ИЗ ЛОГОВ КРИСТАЛЛОВ
# ============================================================

class CrystalMining:
    """Извлекает новые сущности из уже сгенерированных кристаллов."""

    def __init__(self, crystals: List[Dict]):
        """
        :param crystals: список словарей с данными кристаллов (парсинг из JSON).
        """
        self.crystals = crystals

    def extract_frequent_elements(self, min_freq: int = 3) -> Dict[str, List[str]]:
        """
        Находит часто встречающиеся элементы в кристаллах.
        Возвращает словарь {категория: [элемент, ...]}.
        """
        element_counter = Counter()
        for c in self.crystals:
            for elem in c.get("elements", []):
                element_counter[elem] += 1

        # Группируем по категориям (пытаемся определить категорию по вхождению в LEXICON)
        # Здесь проще вернуть список всех элементов, но для обогащения можно попытаться
        # найти категорию через обратный поиск.
        # Для простоты возвращаем плоский список.
        return {"frequent_elements": [elem for elem, cnt in element_counter.items()
                                      if cnt >= min_freq]}

    def extract_frequent_operators(self, min_freq: int = 2) -> List[str]:
        """
        Находит часто используемые операторы.
        Возвращает список ключей операторов.
        """
        op_counter = Counter()
        for c in self.crystals:
            for op in c.get("operators", []):
                op_counter[op.get("key", "")] += 1
        return [op_key for op_key, cnt in op_counter.items() if cnt >= min_freq and op_key]

    def extract_frequent_patterns(self, min_freq: int = 2) -> List[Dict]:
        """
        Находит часто встречающиеся паттерны (по структуре).
        Возвращает список словарей паттернов, сгенерированных на основе шаблонов.
        """
        pattern_counter = Counter()
        for c in self.crystals:
            pattern_name = c.get("pattern", "")
            if pattern_name:
                pattern_counter[pattern_name] += 1
        # Возвращаем имена паттернов с частотой >= min_freq
        return [{"name": pat, "frequency": cnt}
                for pat, cnt in pattern_counter.items() if cnt >= min_freq]


# ============================================================
# 3. ГЕНЕРАЦИЯ НОВЫХ ПАТТЕРНОВ ИЗ СУЩЕСТВУЮЩИХ
# ============================================================

class PatternGenerator:
    """Генерирует новые структурные паттерны на основе существующих."""

    @staticmethod
    def mutate_pattern(pattern: Dict) -> Dict:
        """
        Мутирует существующий паттерн: меняет шаблон, сложность или имя.
        """
        new_pat = pattern.copy()
        # Изменяем сложность
        if "complexity" in new_pat:
            delta = random.choice([-1, 0, 1])
            new_pat["complexity"] = max(1, new_pat["complexity"] + delta)
        # Добавляем суффикс к имени
        if "name" in new_pat:
            suffixes = ["_mut", "_v2", "_alt", "_deep", "_recursive"]
            new_pat["name"] = new_pat["name"] + random.choice(suffixes)
        # Меняем шаблон, добавляя случайный оператор или элемент
        # (здесь можно реализовать более сложную логику)
        return new_pat

    @classmethod
    def generate_from_existing(cls, existing_patterns: List[Dict],
                               count: int = 5) -> List[Dict]:
        """
        Генерирует новые паттерны на основе существующих путём мутации.
        """
        if not existing_patterns:
            return []
        new_patterns = []
        for _ in range(count):
            base = random.choice(existing_patterns)
            new_patterns.append(cls.mutate_pattern(base))
        return new_patterns


# ============================================================
# 4. ОБОГАЩЕНИЕ ИЗ ВНЕШНИХ ИСТОЧНИКОВ (ЗАГЛУШКИ)
# ============================================================

class ExternalSourceFetcher:
    """Заглушка для получения данных из внешних источников (ArXiv, Wikipedia и т.д.)"""

    @staticmethod
    def fetch_from_arxiv(query: str, max_results: int = 10) -> List[str]:
        """
        Заглушка. В реальности можно использовать arxiv.py или API.
        Возвращает список терминов.
        """
        # Имитация ответа
        return [f"arxiv_{query}_{i}" for i in range(max_results)]

    @staticmethod
    def fetch_from_wikipedia(topic: str, max_terms: int = 20) -> List[str]:
        """Заглушка. В реальности — использовать Wikipedia API."""
        return [f"wiki_{topic}_{i}" for i in range(max_terms)]

    @staticmethod
    def fetch_from_google_books(query: str, max_terms: int = 20) -> List[str]:
        """Заглушка."""
        return [f"gb_{query}_{i}" for i in range(max_terms)]


# ============================================================
# 5. МЕНЕДЖЕР ОБОГАЩЕНИЯ
# ============================================================

class EnrichmentManager:
    """
    Главный класс, управляющий процессом обогащения.
    Использует import_engine для применения изменений.
    """

    def __init__(self, import_manager, LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON):
        self.import_manager = import_manager
        self.LEXICON = LEXICON
        self.OPERATORS = OPERATORS
        self.STRUCTURAL_PATTERNS = STRUCTURAL_PATTERNS
        self.FOCUS_LEXICON = FOCUS_LEXICON

    def enrich_from_text(self, text: str, target_category: str = "обогащённые_термины",
                         max_terms: int = 20) -> Dict:
        """
        Извлекает термины из текста и добавляет их в LEXICON.
        """
        # Извлекаем фразы и сущности
        phrases = TermExtractor.extract_phrases(text, min_len=2, max_len=4, min_freq=1)
        entities = TermExtractor.extract_entities(text)

        # Объединяем и отбираем top
        all_terms = list(set(phrases + entities))
        # Фильтруем слишком короткие (<3 символов) и слишком длинные (>40)
        all_terms = [t for t in all_terms if 3 <= len(t) <= 40]

        # Отбираем случайные или первые max_terms
        if len(all_terms) > max_terms:
            import random
            all_terms = random.sample(all_terms, max_terms)

        # Создаём батч для импорта
        from import_engine import ImportableEntity, ImportBatch
        entities_list = []
        for term in all_terms:
            # Проверяем, есть ли уже такой термин
            # Можно пропустить дубликаты
            # Просто добавляем в категорию target_category
            entities_list.append(ImportableEntity(
                category="lexicon",
                name=term,
                value=target_category,
                description=f"Извлечено из текста"
            ))

        batch = ImportBatch(
            source_file="<текст>",
            entities=entities_list,
            format="text",
            total=len(entities_list),
            valid=len(entities_list),
            errors=[]
        )

        # Применяем через импорт
        stats = self.import_manager.apply_batch(batch, merge_mode="add")
        return stats

    def enrich_from_crystals(self, crystals: List[Dict],
                             min_freq_elements: int = 3,
                             min_freq_operators: int = 2,
                             generate_patterns: bool = True) -> Dict:
        """
        Обогащает базу на основе анализа сгенерированных кристаллов.
        """
        miner = CrystalMining(crystals)
        stats = {"lexicon_added": 0, "operators_added": 0, "patterns_added": 0}

        # Извлекаем частые элементы
        freq_elements = miner.extract_frequent_elements(min_freq=min_freq_elements)
        if freq_elements.get("frequent_elements"):
            # Добавляем их в LEXICON (в категорию "частотные_элементы")
            from import_engine import ImportableEntity, ImportBatch
            entities = []
            for elem in freq_elements["frequent_elements"]:
                # Проверим, есть ли уже такой элемент (можно пропустить)
                # Просто добавим
                entities.append(ImportableEntity(
                    category="lexicon",
                    name=elem,
                    value="частотные_элементы_из_кристаллов",
                    description="Извлечено из логов кристаллов"
                ))
            if entities:
                batch = ImportBatch(
                    source_file="<кристаллы>",
                    entities=entities,
                    format="crystal_logs",
                    total=len(entities),
                    valid=len(entities),
                    errors=[]
                )
                stats_lex = self.import_manager.apply_batch(batch, merge_mode="add")
                stats["lexicon_added"] = stats_lex.get("lexicon_added", 0)

        # Извлекаем частые операторы
        freq_ops = miner.extract_frequent_operators(min_freq=min_freq_operators)
        if freq_ops:
            from import_engine import ImportableEntity, ImportBatch
            entities = []
            for op_key in freq_ops:
                # Если оператора нет в OPERATORS — мы можем создать его копию
                # или просто проигнорировать
                if op_key in self.OPERATORS:
                    # Уже есть, пропускаем
                    continue
                # Создаём простой оператор-заглушку
                entities.append(ImportableEntity(
                    category="operators",
                    name=op_key + "_auto",
                    value={"symbol": f"auto_{op_key}", "type": "auto"},
                    description="Автоматически сгенерированный оператор"
                ))
            if entities:
                batch = ImportBatch(
                    source_file="<кристаллы>",
                    entities=entities,
                    format="crystal_logs",
                    total=len(entities),
                    valid=len(entities),
                    errors=[]
                )
                stats_op = self.import_manager.apply_batch(batch, merge_mode="add")
                stats["operators_added"] = stats_op.get("operators_added", 0)

        # Генерируем новые паттерны
        if generate_patterns:
            # Используем существующие паттерны для мутации
            existing = self.STRUCTURAL_PATTERNS
            new_pats = PatternGenerator.generate_from_existing(existing, count=3)
            if new_pats:
                from import_engine import ImportableEntity, ImportBatch
                entities = []
                for pat in new_pats:
                    entities.append(ImportableEntity(
                        category="patterns",
                        name=pat.get("name", ""),
                        value=pat,
                        description="Сгенерировано мутацией существующих паттернов"
                    ))
                batch = ImportBatch(
                    source_file="<паттерны>",
                    entities=entities,
                    format="crystal_logs",
                    total=len(entities),
                    valid=len(entities),
                    errors=[]
                )
                stats_pat = self.import_manager.apply_batch(batch, merge_mode="add")
                stats["patterns_added"] = stats_pat.get("patterns_added", 0)

        return stats

    def enrich_external(self, source: str, query: str, max_terms: int = 20) -> Dict:
        """
        Обогащение из внешнего источника (заглушка).
        source: 'arxiv', 'wikipedia', 'google_books'
        """
        fetcher = ExternalSourceFetcher()
        if source == "arxiv":
            terms = fetcher.fetch_from_arxiv(query, max_terms)
        elif source == "wikipedia":
            terms = fetcher.fetch_from_wikipedia(query, max_terms)
        elif source == "google_books":
            terms = fetcher.fetch_from_google_books(query, max_terms)
        else:
            return {"error": f"Неизвестный источник {source}"}

        # Добавляем в LEXICON
        from import_engine import ImportableEntity, ImportBatch
        entities = []
        for term in terms:
            entities.append(ImportableEntity(
                category="lexicon",
                name=term,
                value=f"external_{source}",
                description=f"Из {source} по запросу '{query}'"
            ))
        batch = ImportBatch(
            source_file=f"<external:{source}>",
            entities=entities,
            format="external",
            total=len(entities),
            valid=len(entities),
            errors=[]
        )
        stats = self.import_manager.apply_batch(batch, merge_mode="add")
        return stats


# ============================================================
# 6. ПРИМЕР ИСПОЛЬЗОВАНИЯ (для тестирования)
# ============================================================

if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from metacrystal_engine_v7 import LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON
    from import_engine import ImportManager

    # Создаём импорт-менеджер
    import_manager = ImportManager(Path("."), LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON)
    enrichment = EnrichmentManager(import_manager, LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON)

    # Пример обогащения из текста
    text = "Мета-кристаллы представляют собой квантовые структуры, сочетающие алхимию и теорию струн. " \
           "Генерация паттернов основана на принципах самоподобия и фрактальной геометрии. " \
           "Нейронные сети и когнитивные искажения также могут влиять на процесс."
    stats = enrichment.enrich_from_text(text, target_category="пример_обогащения", max_terms=10)
    print("Обогащение из текста:", stats)

    # Пример обогащения из кристаллов (если есть файлы)
    # crystals = [] # загрузите из папки
    # stats_c = enrichment.enrich_from_crystals(crystals)
    # print(stats_c)

    # Пример внешнего обогащения (заглушка)
    # stats_ext = enrichment.enrich_external("wikipedia", "квантовая гравитация")
    # print(stats_ext)
