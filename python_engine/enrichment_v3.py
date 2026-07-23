#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
МОДУЛЬ ОБОГАЩЕНИЯ БАЗЫ НА ОСНОВЕ MMSS v3.0
=============================================
Реализует принципы квантово-фрактальной топологии для автономного расширения базы знаний.

Ключевые концепции:
- Фрактальная генерация (⊛): создание новых терминов через самоподобное отображение
- Квантовая суперпозиция (⊕): смешивание элементов из разных категорий
- Автономное обнаружение изоморфизмов (⊘): поиск скрытых связей между доменами
- Топологические фазовые переходы (↯): изменение структуры при обнаружении новых паттернов

Выходные данные:
- Новые элементы в LEXICON (категории и термины)
- Новые операторы в OPERATORS
- Новые структурные паттерны в STRUCTURAL_PATTERNS
- Новые фокусы в FOCUS_LEXICON
"""

import json
import random
import hashlib
import re
from pathlib import Path
from typing import Dict, List, Any, Optional, Set, Tuple
from dataclasses import dataclass, field
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

# ============================================================
# 1. БАЗОВЫЕ КЛАССЫ ДАННЫХ
# ============================================================

@dataclass
class FractalSeed:
    """Исходные данные для фрактальной генерации."""
    category: str
    elements: List[str]
    depth: int = 1
    mutation_rate: float = 0.2
    crossover_rate: float = 0.5

@dataclass
class QuantumState:
    """Состояние квантовой суперпозиции (эмуляция)."""
    components: List[Tuple[str, float]]  # (элемент, амплитуда)
    coherence: float = 0.9  # 0..1

@dataclass
class Isomorphism:
    """Обнаруженный изоморфизм между доменами."""
    source_category: str
    source_element: str
    target_category: str
    target_element: str
    similarity: float  # 0..1
    description: str = ""

@dataclass
class EnrichmentBatch:
    """Результат обогащения."""
    new_lexicon_items: Dict[str, List[str]]  # категория -> список терминов
    new_operators: Dict[str, Dict]           # ключ -> описание оператора
    new_patterns: List[Dict]                 # список паттернов
    new_focus_items: Dict[str, List[str]]    # фокус -> список слов
    isomorphisms: List[Isomorphism]          # обнаруженные изоморфизмы


# ============================================================
# 2. ФРАКТАЛЬНЫЙ ГЕНЕРАТОР (⊛)
# ============================================================

class FractalGenerator:
    """
    Генерирует новые термины через итеративный фрактальный процесс.
    Принцип: из существующих элементов создаются новые путём мутации и кроссовера.
    """

    def __init__(self, lexicon: Dict[str, List[str]], operators: Dict, patterns: List, focus: Dict):
        self.lexicon = lexicon
        self.operators = operators
        self.patterns = patterns
        self.focus = focus
        self.cache = {}

    def generate(self, seed: FractalSeed, iterations: int = 3) -> List[str]:
        """
        Основной метод генерации. Возвращает список новых терминов.
        """
        result = set()
        current = set(seed.elements)

        for depth in range(iterations):
            new_elements = set()
            for elem in current:
                # Мутация (изменение суффикса, добавление приставки)
                mutated = self._mutate(elem, seed.mutation_rate)
                new_elements.update(mutated)

                # Кроссовер (смешивание с другим элементом из той же категории)
                if len(current) > 1 and random.random() < seed.crossover_rate:
                    other = random.choice(list(current - {elem}))
                    crossed = self._crossover(elem, other)
                    new_elements.update(crossed)

            # Добавляем только те, которых ещё нет в базе
            existing = set(self.lexicon.get(seed.category, []))
            new_elements = new_elements - existing - result
            result.update(new_elements)
            current = new_elements

        return list(result)

    def _mutate(self, word: str, rate: float) -> Set[str]:
        """Мутирует слово: заменяет, вставляет, удаляет символы."""
        if random.random() > rate:
            return {word}

        results = set()
        mutations = [
            self._add_prefix,
            self._add_suffix,
            self._replace_letter,
            self._insert_letter,
            self._delete_letter,
        ]
        for _ in range(2):  # 2 мутации на слово
            m = random.choice(mutations)
            try:
                new_word = m(word)
                if new_word and new_word != word:
                    results.add(new_word)
            except:
                pass
        return results or {word}

    def _crossover(self, w1: str, w2: str) -> Set[str]:
        """Смешивает два слова: берёт начало от одного, конец от другого."""
        if len(w1) < 3 or len(w2) < 3:
            return {w1, w2}
        cut1 = random.randint(1, len(w1)-1)
        cut2 = random.randint(1, len(w2)-1)
        new1 = w1[:cut1] + w2[cut2:]
        new2 = w2[:cut2] + w1[cut1:]
        return {new1, new2} if new1 != new2 else {new1}

    def _add_prefix(self, word: str) -> str:
        prefixes = ["супер", "мега", "гипер", "транс", "анти", "квази", "псевдо", "нео"]
        if len(word) < 3:
            return word
        return random.choice(prefixes) + word

    def _add_suffix(self, word: str) -> str:
        suffixes = ["изм", "ик", "ость", "ация", "ция", "тор", "ия", "ус"]
        if len(word) < 3:
            return word
        return word + random.choice(suffixes)

    def _replace_letter(self, word: str) -> str:
        if len(word) < 3:
            return word
        idx = random.randint(0, len(word)-1)
        replacements = "aeiouyабвгдеёжзийклмнопрстуфхцчшщъыьэюя"
        return word[:idx] + random.choice(replacements) + word[idx+1:]

    def _insert_letter(self, word: str) -> str:
        if len(word) < 2:
            return word
        idx = random.randint(0, len(word)-1)
        ch = random.choice("aeiouyабвгдеёжзийклмнопрстуфхцчшщъыьэюя")
        return word[:idx] + ch + word[idx:]

    def _delete_letter(self, word: str) -> str:
        if len(word) < 3:
            return word
        idx = random.randint(0, len(word)-1)
        return word[:idx] + word[idx+1:]


# ============================================================
# 3. КВАНТОВАЯ СУПЕРПОЗИЦИЯ (⊕)
# ============================================================

class QuantumSuperposition:
    """
    Создаёт гибридные сущности из разных категорий,
    используя принцип суперпозиции: каждый новый элемент
    является комбинацией нескольких исходных с разными амплитудами.
    """

    def __init__(self, lexicon: Dict[str, List[str]], operators: Dict):
        self.lexicon = lexicon
        self.operators = operators

    def create_hybrids(self, categories: List[str], num_hybrids: int = 10) -> Dict[str, List[str]]:
        """
        Создаёт гибридные термины, смешивая элементы из указанных категорий.
        """
        result = defaultdict(list)
        for _ in range(num_hybrids):
            # Выбираем две случайные категории
            if len(categories) < 2:
                break
            cat1, cat2 = random.sample(categories, 2)
            elems1 = self.lexicon.get(cat1, [])
            elems2 = self.lexicon.get(cat2, [])
            if not elems1 or not elems2:
                continue

            # Берём по одному элементу из каждой категории
            e1 = random.choice(elems1)
            e2 = random.choice(elems2)

            # Создаём гибрид (смесь слов или связка через дефис)
            hybrid = f"{e1}-{e2}" if random.random() < 0.5 else f"{e1[:3]}{e2[-3:]}"
            # Добавляем в новую категорию "гибриды" или в одну из исходных
            target_cat = f"{cat1}_{cat2}" if random.random() < 0.3 else cat1
            result[target_cat].append(hybrid)

        return dict(result)


# ============================================================
# 4. АВТОНОМНОЕ ОБНАРУЖЕНИЕ ИЗОМОРФИЗМОВ (⊘)
# ============================================================

class IsomorphismDiscovery:
    """
    Находит скрытые связи между разными категориями на основе
    структурного сходства терминов (общие корни, суффиксы, паттерны).
    """

    def __init__(self, lexicon: Dict[str, List[str]]):
        self.lexicon = lexicon

    def discover(self, threshold: float = 0.3) -> List[Isomorphism]:
        """
        Анализирует все категории и находит пары элементов с высоким сходством.
        """
        isomorphisms = []
        categories = list(self.lexicon.keys())

        for i, cat1 in enumerate(categories):
            for cat2 in categories[i+1:]:
                elems1 = self.lexicon.get(cat1, [])
                elems2 = self.lexicon.get(cat2, [])
                for e1 in elems1:
                    for e2 in elems2:
                        sim = self._similarity(e1, e2)
                        if sim > threshold:
                            isomorphisms.append(Isomorphism(
                                source_category=cat1,
                                source_element=e1,
                                target_category=cat2,
                                target_element=e2,
                                similarity=sim,
                                description=f"Обнаружен изоморфизм между {cat1} и {cat2} через элементы '{e1}' и '{e2}'"
                            ))
        return isomorphisms

    def _similarity(self, w1: str, w2: str) -> float:
        """Вычисляет сходство двух строк на основе общих символов и длин."""
        if not w1 or not w2:
            return 0.0
        # Общие символы
        common = len(set(w1) & set(w2))
        max_len = max(len(w1), len(w2))
        return common / max_len if max_len > 0 else 0.0


# ============================================================
# 5. ТОПОЛОГИЧЕСКИЙ ФАЗОВЫЙ ПЕРЕХОД (↯)
# ============================================================

class TopologicalPhaseTransition:
    """
    При обнаружении новых изоморфизмов изменяет структуру базы:
    - Создаёт новые категории (объединение связанных доменов)
    - Добавляет мета-категории
    - Перемещает элементы между категориями для улучшения связности
    """

    def __init__(self, lexicon: Dict[str, List[str]]):
        self.lexicon = lexicon

    def apply(self, isomorphisms: List[Isomorphism]) -> Dict[str, List[str]]:
        """
        Применяет фазовый переход: создаёт новые категории и перераспределяет элементы.
        """
        new_lexicon = dict(self.lexicon)

        # Группируем изоморфизмы по связанным категориям
        graph = defaultdict(set)
        for iso in isomorphisms:
            if iso.similarity > 0.5:
                graph[iso.source_category].add(iso.target_category)
                graph[iso.target_category].add(iso.source_category)

        # Для каждой компоненты связности создаём мета-категорию
        visited = set()
        for cat in list(graph.keys()):
            if cat in visited:
                continue
            # BFS для компоненты
            component = set()
            stack = [cat]
            while stack:
                node = stack.pop()
                if node in visited:
                    continue
                visited.add(node)
                component.add(node)
                stack.extend(graph[node] - visited)

            if len(component) > 1:
                # Создаём мета-категорию
                meta_name = "_".join(sorted(component))[:30] + "_meta"
                meta_elements = []
                for c in component:
                    meta_elements.extend(self.lexicon.get(c, []))
                # Берём только уникальные
                new_lexicon[meta_name] = list(set(meta_elements))

        return new_lexicon


# ============================================================
# 6. ГЛАВНЫЙ КЛАСС ОБОГАТИТЕЛЯ
# ============================================================

class EnricherV3:
    """
    Главный класс, объединяющий все компоненты v3.0 для обогащения базы.
    """

    def __init__(self, lexicon: Dict, operators: Dict, patterns: List, focus: Dict):
        self.lexicon = lexicon
        self.operators = operators
        self.patterns = patterns
        self.focus = focus

        self.fractal_gen = FractalGenerator(lexicon, operators, patterns, focus)
        self.quantum = QuantumSuperposition(lexicon, operators)
        self.iso_discovery = IsomorphismDiscovery(lexicon)
        self.phase = TopologicalPhaseTransition(lexicon)

    def enrich(self, params: Dict) -> EnrichmentBatch:
        """Основной метод обогащения. Параметры:
        - categories_to_evolve: список категорий для эволюции
        - iterations: количество итераций фрактальной генерации (1-5)
        - hybrid_count: количество гибридов (1-50)
        - iso_threshold: порог для обнаружения изоморфизмов (0.0-1.0)
        - apply_phase_transition: применять ли фазовый переход
        - seed: integer для детерминированности (None = случайный)
        - max_terms_per_category: лимит терминов на категорию (по умолчанию 20)
        - min_word_length: минимальная длина генерируемых терминов (3)
        - max_word_length: максимальная длина (40)
        - deduplicate_cross_category: проверять дубликаты во всех категориях
        """
        # ВАЖНО: детерминированность через seed
        seed = params.get("seed")
        if seed is not None:
            random.seed(int(seed))

        categories = params.get("categories_to_evolve", list(self.lexicon.keys())[:10])
        iterations = max(1, min(5, int(params.get("iterations", 3))))
        hybrid_count = max(1, min(50, int(params.get("hybrid_count", 10))))
        iso_threshold = float(params.get("iso_threshold", 0.3))
        apply_phase = params.get("apply_phase_transition", True)
        max_terms_per_cat = int(params.get("max_terms_per_category", 20))
        min_len = int(params.get("min_word_length", 3))
        max_len = int(params.get("max_word_length", 40))
        dedup_cross = params.get("deduplicate_cross_category", True)

        # Соберём множество всех существующих терминов для дедупликации
        all_existing_terms: Set[str] = set()
        if dedup_cross:
            for cat_items in self.lexicon.values():
                all_existing_terms.update(cat_items)

        # 1. Фрактальная генерация
        new_lexicon_items: Dict[str, List[str]] = {}
        for cat in categories:
            if cat not in self.lexicon:
                continue
            seed_obj = FractalSeed(
                category=cat,
                elements=self.lexicon[cat],
                depth=1,
                mutation_rate=0.2,
                crossover_rate=0.5
            )
            new_terms = self.fractal_gen.generate(seed_obj, iterations)
            # Фильтрация по длине
            new_terms = [t for t in new_terms if min_len <= len(t) <= max_len]
            # Дедупликация
            if dedup_cross:
                new_terms = [t for t in new_terms
                             if t not in all_existing_terms and t not in self.lexicon.get(cat, [])]
            else:
                new_terms = [t for t in new_terms if t not in self.lexicon.get(cat, [])]
            # Лимит количества
            new_terms = new_terms[:max_terms_per_cat]
            if new_terms:
                new_lexicon_items[cat] = new_terms
                # Обновляем множество существующих терминов
                if dedup_cross:
                    all_existing_terms.update(new_terms)

        # 2. Квантовая суперпозиция (гибриды)
        hybrids = self.quantum.create_hybrids(categories, hybrid_count)
        for cat, items in hybrids.items():
            # Фильтрация
            items = [t for t in items if min_len <= len(t) <= max_len]
            if dedup_cross:
                items = [t for t in items
                         if t not in all_existing_terms and t not in self.lexicon.get(cat, [])]
            else:
                items = [t for t in items if t not in self.lexicon.get(cat, [])]
            items = items[:max_terms_per_cat]
            if items:
                if cat in new_lexicon_items:
                    # Не дублируем
                    existing = set(new_lexicon_items[cat])
                    new_items = [t for t in items if t not in existing]
                    new_lexicon_items[cat].extend(new_items)
                else:
                    new_lexicon_items[cat] = items
                if dedup_cross:
                    all_existing_terms.update(items)

        # 3. Обнаружение изоморфизмов (лимитируем количество для предсказуемости)
        isomorphisms = self.iso_discovery.discover(iso_threshold)
        # Сортируем по убыванию сходства и берём топ-100
        isomorphisms.sort(key=lambda x: -x.similarity)
        isomorphisms = isomorphisms[:100]

        # 4. Топологический фазовый переход
        if apply_phase and isomorphisms:
            new_lexicon_after_phase = self.phase.apply(isomorphisms)
            for cat, items in new_lexicon_after_phase.items():
                if cat not in self.lexicon:
                    # Новая мета-категория
                    items = [t for t in items if min_len <= len(t) <= max_len]
                    if dedup_cross:
                        items = [t for t in items if t not in all_existing_terms]
                    items = items[:max_terms_per_cat]
                    if items:
                        new_lexicon_items[cat] = items
                        if dedup_cross:
                            all_existing_terms.update(items)

        return EnrichmentBatch(
            new_lexicon_items=new_lexicon_items,
            new_operators={},
            new_patterns=[],
            new_focus_items={},
            isomorphisms=isomorphisms
        )

    def apply_batch(self, batch: EnrichmentBatch) -> Dict:
        """
        Применяет результаты обогащения к текущей базе (мутирует LEXICON и др.)
        """
        stats = {"lexicon_added": 0, "operators_added": 0, "patterns_added": 0}

        # Добавляем новые термины в LEXICON
        for cat, items in batch.new_lexicon_items.items():
            if cat not in self.lexicon:
                self.lexicon[cat] = []
            for item in items:
                if item not in self.lexicon[cat]:
                    self.lexicon[cat].append(item)
                    stats["lexicon_added"] += 1

        # Добавляем операторы (если есть)
        for key, op in batch.new_operators.items():
            if key not in self.operators:
                self.operators[key] = op
                stats["operators_added"] += 1

        # Добавляем паттерны
        for pat in batch.new_patterns:
            if pat not in self.patterns:
                self.patterns.append(pat)
                stats["patterns_added"] += 1

        # Добавляем фокусы
        for focus, words in batch.new_focus_items.items():
            if focus not in self.focus:
                self.focus[focus] = []
            for w in words:
                if w not in self.focus[focus]:
                    self.focus[focus].append(w)

        return stats


# ============================================================
# 7. ИНТЕГРАЦИЯ С IMPORT_ENGINE
# ============================================================

def enrich_from_external_source(source_text: str, enricher: EnricherV3) -> EnrichmentBatch:
    """
    Извлекает термины из текста и обогащает базу, используя v3.0 принципы.
    """
    # Простая эвристика: извлекаем все слова длиной > 3 символа
    words = re.findall(r'\b[а-яА-Яa-zA-Z]{4,}\b', source_text)
    # Разбиваем на категории по первому символу (упрощённо)
    categories = defaultdict(list)
    for w in words:
        key = w[0].upper()
        if key.isalpha():
            categories[key].append(w.lower())

    # Превращаем в формат, понятный обогатителю
    enrich_params = {
        "categories_to_evolve": list(categories.keys())[:20],
        "iterations": 2,
        "hybrid_count": 5,
        "iso_threshold": 0.2,
        "apply_phase_transition": True
    }
    # Добавляем извлечённые термины как начальные семена
    # Для этого создаём временный лексикон с этими категориями
    temp_lexicon = dict(enricher.lexicon)
    for cat, items in categories.items():
        if cat not in temp_lexicon:
            temp_lexicon[cat] = []
        temp_lexicon[cat].extend(items)

    # Создаём новый обогатитель с временным лексиконом
    temp_enricher = EnricherV3(temp_lexicon, enricher.operators, enricher.patterns, enricher.focus)
    batch = temp_enricher.enrich(enrich_params)
    return batch


# ============================================================
# 8. ПРИМЕР ИСПОЛЬЗОВАНИЯ
# ============================================================

if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from metacrystal_engine_v7 import LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON

    # Создаём обогатитель
    enricher = EnricherV3(LEXICON, OPERATORS, STRUCTURAL_PATTERNS, FOCUS_LEXICON)

    # Запускаем обогащение
    batch = enricher.enrich({
        "categories_to_evolve": ["математика", "физика", "логика", "психология"],
        "iterations": 2,
        "hybrid_count": 10,
        "iso_threshold": 0.3,
        "apply_phase_transition": True
    })

    print(f"Сгенерировано новых терминов: {sum(len(v) for v in batch.new_lexicon_items.values())}")
    for cat, items in batch.new_lexicon_items.items():
        print(f"  {cat}: {items[:5]}...")

    print(f"Обнаружено изоморфизмов: {len(batch.isomorphisms)}")
    for iso in batch.isomorphisms[:5]:
        print(f"  {iso.source_category}.{iso.source_element} ↔ {iso.target_category}.{iso.target_element} (sim={iso.similarity:.2f})")
