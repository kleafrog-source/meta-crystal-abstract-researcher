#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
МОДУЛЬ ПАЙПЛАЙНОВ (PIPELINE ENGINE)
======================================
Позволяет создавать и выполнять последовательности шагов генерации.

Возможности:
- Определение шагов с параметрами генерации (профили)
- Рандомизация параметров в пределах допустимых значений
- Законы изменения параметров от шага к шагу
- Сохранение и загрузка пайплайнов в JSON
- Выполнение с логированием и возможностью остановки
- Условные переходы между шагами (по качеству, количеству и т.д.)
"""

import os
import json
import random
import time
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# ============================================================
# 1. КЛАССЫ ДАННЫХ
# ============================================================

@dataclass
class PipelineStep:
    """Описывает один шаг пайплайна."""
    name: str
    profile: Dict[str, Any]          # полный профиль (как в профилях GUI)
    repetitions: int = 1             # сколько раз выполнить этот шаг
    randomize: bool = False           # рандомизировать ли параметры в пределах допустимых значений
    law: Optional[str] = None        # закон изменения параметров ("increase_generations", "toggle_flags", ...)
    law_params: Dict[str, Any] = field(default_factory=dict)  # параметры для закона
    next_step_condition: Optional[str] = None  # условие перехода ("quality > 0.9", "count > 10", ...)
    pause_after: int = 0             # пауза (сек) после шага
    save_results: bool = True        # сохранять ли результаты этого шага

@dataclass
class Pipeline:
    """Контейнер для последовательности шагов."""
    name: str
    description: str
    steps: List[PipelineStep]
    created: str = field(default_factory=lambda: datetime.now().isoformat())
    modified: str = field(default_factory=lambda: datetime.now().isoformat())


# ============================================================
# 2. ЗАКОНЫ ИЗМЕНЕНИЯ ПАРАМЕТРОВ
# ============================================================

class ParameterLaw:
    """Реализует законы изменения параметров от шага к шагу."""

    @staticmethod
    def increase_generations(step: PipelineStep, current_repeat: int, total_repeats: int) -> Dict:
        """Увеличивает количество поколений на 1 за каждый повтор."""
        params = step.profile.copy()
        gen = params.get("params", {}).get("generations", 2)
        params["params"]["generations"] = gen + current_repeat
        return params

    @staticmethod
    def increase_batch(step: PipelineStep, current_repeat: int, total_repeats: int) -> Dict:
        """Увеличивает батч экспоненциально (каждый следующий в 1.5 раза)."""
        params = step.profile.copy()
        batch = params.get("params", {}).get("batch", 100)
        params["params"]["batch"] = int(batch * (1.5 ** current_repeat))
        return params

    @staticmethod
    def toggle_flags_random(step: PipelineStep, current_repeat: int, total_repeats: int) -> Dict:
        """Случайно включает/отключает флаги доменов."""
        params = step.profile.copy()
        flags = params.get("flags", {})
        for key in list(flags.keys()):
            if random.random() < 0.3:  # 30% шанс изменить
                flags[key] = not flags[key]
        params["flags"] = flags
        return params

    @staticmethod
    def decrease_entropy(step: PipelineStep, current_repeat: int, total_repeats: int) -> Dict:
        """Постепенно уменьшает invert_probability и psychology_probability."""
        params = step.profile.copy()
        inv = params.get("params", {}).get("invert_probability", 0.4)
        psych = params.get("params", {}).get("psychology_probability", 0.6)
        params["params"]["invert_probability"] = max(0.0, inv - 0.05 * current_repeat)
        params["params"]["psychology_probability"] = max(0.0, psych - 0.05 * current_repeat)
        return params

    @staticmethod
    def randomize_all(step: PipelineStep, current_repeat: int, total_repeats: int) -> Dict:
        """Полностью рандомизирует параметры в разумных пределах."""
        params = step.profile.copy()
        p = params.get("params", {})
        p["generations"] = random.randint(1, 10)
        p["batch"] = random.randint(20, 500)
        p["top"] = random.randint(1, 10)
        p["max_depth"] = random.randint(3, 12)
        p["max_elements"] = random.randint(4, 20)
        p["invert_probability"] = random.uniform(0.0, 1.0)
        p["psychology_probability"] = random.uniform(0.0, 1.0)
        # Флаги
        flags = params.get("flags", {})
        for key in list(flags.keys()):
            if random.random() < 0.5:
                flags[key] = random.choice([True, False])
        params["params"] = p
        params["flags"] = flags
        return params

    # Словарь доступных законов
    LAW_REGISTRY = {
        "increase_generations": increase_generations,
        "increase_batch": increase_batch,
        "toggle_flags_random": toggle_flags_random,
        "decrease_entropy": decrease_entropy,
        "randomize_all": randomize_all,
    }

    @classmethod
    def apply(cls, step: PipelineStep, current_repeat: int, total_repeats: int) -> Dict:
        """Применяет закон к шагу, возвращает изменённый профиль."""
        if not step.law:
            return step.profile.copy()
        law_func = cls.LAW_REGISTRY.get(step.law)
        if law_func:
            return law_func(step, current_repeat, total_repeats)
        else:
            logger.warning(f"Неизвестный закон: {step.law}")
            return step.profile.copy()


# ============================================================
# 3. УСЛОВИЯ ПЕРЕХОДА
# ============================================================

class ConditionEvaluator:
    """Проверяет условия перехода между шагами."""

    @staticmethod
    def evaluate(condition: Optional[str], step_result: Dict) -> bool:
        """
        Проверяет условие на основе результата шага.

        Поддерживаемые условия:
        - "quality > 0.9" — качество алмаза больше 0.9
        - "count > 10" — количество изумрудов больше 10
        - "diamond_exists" — алмаз создан
        - "always" — всегда True
        - "never" — всегда False
        """
        if not condition:
            return True
        if condition.strip() == "always":
            return True
        if condition.strip() == "never":
            return False

        # Парсим простые условия вида "quality > 0.9", "count > 10", "diamond_exists"
        parts = condition.strip().split()
        if len(parts) == 3:
            var, op, val = parts[0], parts[1], parts[2]
            # Получаем значение из результата
            if var == "quality":
                real_val = step_result.get("quality_score", 0)
            elif var == "count":
                real_val = len(step_result.get("emeralds", []))
            elif var == "saved":
                real_val = step_result.get("saved_count", 0)
            else:
                return True

            try:
                val_num = float(val)
                if op == ">":
                    return real_val > val_num
                elif op == ">=":
                    return real_val >= val_num
                elif op == "<":
                    return real_val < val_num
                elif op == "<=":
                    return real_val <= val_num
                elif op == "==":
                    return real_val == val_num
                else:
                    return True
            except:
                return True

        if condition.strip() == "diamond_exists":
            return bool(step_result.get("diamond"))
        if condition.strip() == "no_diamond":
            return not bool(step_result.get("diamond"))

        return True


# ============================================================
# 4. ИСПОЛНИТЕЛЬ ПАЙПЛАЙНА
# ============================================================

class PipelineExecutor:
    """Выполняет пайплайн, управляет процессом, собирает результаты."""

    def __init__(self, engine, pipeline: Pipeline, callback: Optional[Callable] = None):
        """
        :param engine: экземпляр MetaEngine (или его обёртка)
        :param pipeline: объект Pipeline
        :param callback: функция обратного вызова для прогресса (шаг, повтор, сообщение)
        """
        self.engine = engine
        self.pipeline = pipeline
        self.callback = callback
        self.stopped = False
        self.results = []

    def stop(self):
        """Останавливает выполнение пайплайна."""
        self.stopped = True

    def run(self) -> Dict:
        """Запускает выполнение пайплайна."""
        self.results = []
        total_steps = len(self.pipeline.steps)

        for idx, step in enumerate(self.pipeline.steps):
            if self.stopped:
                break

            if self.callback:
                self.callback(f"Шаг {idx+1}/{total_steps}: {step.name}", "info")

            # Выполняем повторения шага
            step_result = None
            for rep in range(step.repetitions):
                if self.stopped:
                    break

                if self.callback:
                    self.callback(f"  Повтор {rep+1}/{step.repetitions}", "info")

                # Применяем закон к параметрам
                params = ParameterLaw.apply(step, rep, step.repetitions)

                # Если нужна рандомизация — применяем отдельный закон randomize_all
                if step.randomize:
                    params = ParameterLaw.randomize_all(step, rep, step.repetitions)

                # Запускаем генерацию
                try:
                    # Подготавливаем профиль для движка
                    # (здесь предполагается, что engine имеет метод run_with_profile)
                    result = self.engine.run_with_profile(params)
                    step_result = result

                    # Если результат сохраняется — добавляем в общий список
                    if step.save_results:
                        self.results.append({
                            "step": step.name,
                            "repeat": rep,
                            "result": result
                        })

                    # Проверяем условие перехода
                    if not ConditionEvaluator.evaluate(step.next_step_condition, result):
                        if self.callback:
                            self.callback(f"Условие {step.next_step_condition} не выполнено, переход к следующему шагу", "warn")
                        break

                except Exception as e:
                    if self.callback:
                        self.callback(f"Ошибка в шаге {step.name}: {e}", "error")
                    # Можно либо прервать, либо продолжить
                    break

                # Пауза после шага
                if step.pause_after > 0:
                    if self.callback:
                        self.callback(f"Пауза {step.pause_after} сек...", "info")
                    time.sleep(step.pause_after)

            if self.stopped:
                break

        # Возвращаем сводку
        summary = {
            "pipeline": self.pipeline.name,
            "steps_executed": len(self.results),
            "total_repeats": sum(r["step"] for r in self.results),
            "results": self.results,
            "stopped": self.stopped
        }
        return summary


# ============================================================
# 5. МЕНЕДЖЕР ПАЙПЛАЙНОВ (СОХРАНЕНИЕ/ЗАГРУЗКА)
# ============================================================

class PipelineManager:
    """Управляет пайплайнами: загрузка, сохранение, список, удаление."""

    def __init__(self, storage_dir: Path):
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def list_pipelines(self) -> List[str]:
        """Возвращает список имён сохранённых пайплайнов."""
        return [f.stem for f in self.storage_dir.glob("*.json")]

    def save(self, pipeline: Pipeline) -> str:
        """Сохраняет пайплайн в JSON."""
        # Преобразуем датаклассы в словари
        data = {
            "name": pipeline.name,
            "description": pipeline.description,
            "created": pipeline.created,
            "modified": datetime.now().isoformat(),
            "steps": [
                {
                    "name": s.name,
                    "profile": s.profile,
                    "repetitions": s.repetitions,
                    "randomize": s.randomize,
                    "law": s.law,
                    "law_params": s.law_params,
                    "next_step_condition": s.next_step_condition,
                    "pause_after": s.pause_after,
                    "save_results": s.save_results,
                }
                for s in pipeline.steps
            ]
        }
        filepath = self.storage_dir / f"{pipeline.name}.json"
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return str(filepath)

    def load(self, name: str) -> Pipeline:
        """Загружает пайплайн из JSON."""
        filepath = self.storage_dir / f"{name}.json"
        if not filepath.exists():
            raise FileNotFoundError(f"Пайплайн {name} не найден")

        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)

        steps = [
            PipelineStep(
                name=s["name"],
                profile=s["profile"],
                repetitions=s.get("repetitions", 1),
                randomize=s.get("randomize", False),
                law=s.get("law"),
                law_params=s.get("law_params", {}),
                next_step_condition=s.get("next_step_condition"),
                pause_after=s.get("pause_after", 0),
                save_results=s.get("save_results", True),
            )
            for s in data.get("steps", [])
        ]

        return Pipeline(
            name=data.get("name", name),
            description=data.get("description", ""),
            steps=steps,
            created=data.get("created", datetime.now().isoformat()),
            modified=data.get("modified", datetime.now().isoformat()),
        )

    def delete(self, name: str) -> bool:
        """Удаляет пайплайн."""
        filepath = self.storage_dir / f"{name}.json"
        if filepath.exists():
            filepath.unlink()
            return True
        return False

    def get_pipeline_path(self, name: str) -> Path:
        return self.storage_dir / f"{name}.json"


# ============================================================
# 6. ИНТЕГРАЦИЯ С ДВИЖКОМ
# ============================================================

# Этот класс будет использоваться в main.py для запуска генерации с профилем
class EngineWrapper:
    """
    Обёртка для MetaEngine, позволяющая запускать генерацию с произвольным профилем.
    В main.py мы создадим экземпляр этого класса, передавая в него реальный MetaEngine.
    """

    def __init__(self, engine, storage):
        self.engine = engine
        self.storage = storage

    def run_with_profile(self, profile: Dict) -> Dict:
        """
        Запускает генерацию с переданным профилем.
        Возвращает результат (словарь с emeralds, diamond, saved_count и т.д.)
        """
        # Извлекаем параметры из профиля
        params = profile.get("params", {})
        generations = params.get("generations", 2)
        batch_size = params.get("batch", 100)
        save_top = params.get("top", 3)

        # Применяем флаги к конфигу
        config = self.engine.config
        flags = profile.get("flags", {})
        for key, value in flags.items():
            if key in config.flags:
                config.flags[key] = value

        # Запускаем эволюцию
        result = self.engine.evolve_with_saving(
            generations=generations,
            batch_size=batch_size,
            save_top=save_top
        )

        # Возвращаем результат (добавляем качество алмаза)
        diamond = result.get("diamond")
        quality_score = diamond.get("quality_score", 0) if diamond else 0
        result["quality_score"] = quality_score
        return result


# ============================================================
# 7. ПРИМЕР ИСПОЛЬЗОВАНИЯ
# ============================================================

if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from metacrystal_engine_v7 import EngineConfig, MetaEngine

    # Пример создания пайплайна
    step1 = PipelineStep(
        name="Шаг 1: разведка",
        profile={
            "params": {"generations": 2, "batch": 100, "top": 3},
            "flags": {"enable_quantum": True, "enable_fractal": False}
        },
        repetitions=1,
        randomize=False,
        law="increase_generations",
        next_step_condition="quality > 0.7"
    )

    step2 = PipelineStep(
        name="Шаг 2: усиление",
        profile={
            "params": {"generations": 3, "batch": 200, "top": 5},
            "flags": {"enable_quantum": True, "enable_fractal": True}
        },
        repetitions=2,
        randomize=True,
        law="toggle_flags_random",
        pause_after=2
    )

    pipeline = Pipeline(
        name="Экспериментальный пайплайн",
        description="Тестовый пайплайн для отладки",
        steps=[step1, step2]
    )

    # Сохраняем
    mgr = PipelineManager(Path("./pipelines"))
    mgr.save(pipeline)
    print(f"Пайплайн сохранён: {pipeline.name}")

    # Загружаем
    loaded = mgr.load("Экспериментальный пайплайн")
    print(f"Загружен пайплайн: {loaded.name}, шагов: {len(loaded.steps)}")
