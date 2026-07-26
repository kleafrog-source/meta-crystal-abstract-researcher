# MMSS — Meta Meta System Synthezator (engine stack)

Минимальный, CPU-only, matrix-free движок инвариантных вычислений + операторы
ℋ ⊛ ⊕ ⊘ ⊗ ↯ + интеграция с репозиторием **meta-crystal-abstract-researcher**
(Мета-Кристалл).

Принцип ядра v2.2: **«инвариант — это вычисление, а не хранение».** Гиперсеть ℋ
генерирует веса маленькой сети из координаты запроса z_q; инвариант = результат
compact forward-pass. Память параметров не растёт с числом запросов (matrix-free).

> Это процессы поисков: творчество и эксперименты ради экспериментов.
> На учебную научную достоверность не претендуем. Если извлекается работающее — мы на верном пути.

---

## Архитектура

```
                    ┌─────────────────────────────────────────────┐
   запрос/узел ───► │ 01 EMBEDDING ENCODER  (pluggable)           │
  (кристалл.combination) │  FeatureHashEncoder | OllamaEncoder      │
                    └──────────────────────┬──────────────────────┘
                                           │ z_q (координата манифолда)
                    ┌──────────────────────▼──────────────────────┐
                    │ 02 WEIGHT GENERATOR                          │
                    │  ℋ linear hypernetwork  |  ⊛ fractal IFS     │
                    │  → W_q (веса инвариант-сети, генерируются)    │
                    └──────────────────────┬──────────────────────┘
                                           │ W_q
                    ┌──────────────────────▼──────────────────────┐
                    │ 03 INVARIANT COMPUTATION  f(z_q; W_q)       │
                    │  inv = результат forward-pass (НЕ матрица)    │
                    └──────────────────────┬──────────────────────┘
                                           │ invariant
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
   ┌──────────────────┐      ┌──────────────────────┐     ┌─────────────────────┐
   │ 04 RENDERER ℘    │      │ ⊘ ISOMORPHISM DETECT │     │ ↯ PHASE TRANSITION  │
   │ text + light +   │      │ cosine кластеры/мосты│     │ слияние кластеров   │
   │ FM-audio         │      │ (adaptive threshold) │     │ → manifested diamond │
   └──────────────────┘      └──────────┬───────────┘     └──────────┬────────────┘
                                        │                              │
                                        ▼                              ▼
                          ┌─────────────────────────────────────────────────┐
                          │ META-CRYSTAL BRIDGE (формат репозитория)        │
                          │ read: data/meta_crystals/crystals/{code}.json  │
                          │ write: manifested/{MMSS-xxxx}.json (diamond)   │
                          │ + isomorphisms.json (граф рёбер)                │
                          └─────────────────────────────────────────────────┘
```

Слои соответствуют 4 демо space-z.ai:
- UI/sensory — Mosaic-Topologies (URL1/2): ⊘/↯/кластеры как UI-события
- compute — Invariant Manifold v2.2 (URL3): ℋ ядро
- autonomy — Quantum-Fractal v3.0 (URL3/2): ⊛ генератор, ⊘ авто-обнаружение
- knowledge/RAG — Мета-Кристалл (URL4): manifested diamonds + isomorphisms.json

---

## Модули

| Файл | Роль |
|---|---|
| `mmss_cycle.schema.json` | JSON-контракт одного цикла (encode→hypernet→compute→⊘→crystal→render) |
| `mmss_v22_core.py` | Ядро v2.2: encoder, ℋ hypernetwork, InvariantNet, Δ-counterfactual, α-depth, render ℘. Бенчмарк matrix-free/O(1). |
| `mmss_distill_isomorphism.py` | Дистилляция ℋ (LLM-teacher-compatible), оператор ⊘ (precision/recall), ↯ переходы, кристаллы |
| `mmss_realtime_session.py` | Realtime-сессия: ℋ из checkpoint → ⊘/↯/кластеры при вводе узла, adaptive threshold (Otsu), UI-снимок для панелей Mosaic-Topologies |
| `mmss_fractal_generator.py` | Оператор ⊛ (v3.0): multi-octave residual IFS — настоящий самоподобный генератор весов, depth-scaling |
| `mmss_ollama_swap.py` | Pluggable Encoder/Teacher контракты + OllamaEncoder/OllamaTeacher (HTTP) + fallback + автодетект |
| `mmss_ollama_pipeline.py` | Связка: detect Ollama → swap encoder/teacher → retrain ℋ → ⊘ (mode: ollama_real / fallback) |
| `mmss_meta_crystal_bridge.py` | **Интеграция с репозиторием**: читает/пишет кристаллы в формате Мета-Кристалла |

**Артефакты:**
- `v22_hyper_synthetic_distilled.pt` — обученная ℋ (checkpoint)
- `crystals.jsonl` — локальный paradox-стор (legacy)
- `v3_fractal_results.json`, `v22_*_results.json` — измеренные метрики

---

## Порядок запуска

```bash
cd mmss

# 1. Установить CPU-only PyTorch (один раз)
pip install torch --index-url https://download.pytorch.org/whl/cpu

# 2. Ядро v2.2 + честные метрики (matrix-free, latency, stability)
python3 mmss_v22_core.py --n 2000 --sample-cycle

# 3. Дистилляция ℋ + оператор ⊘ (precision/recall/F1 vs untrained baseline)
python3 mmss_distill_isomorphism.py
#    → создаёт v22_hyper_synthetic_distilled.pt (обученная ℋ)

# 4. Realtime-сессия (ℋ из checkpoint → ⊘/↯/кластеры, adaptive threshold, кристаллы)
python3 mmss_realtime_session.py

# 5. Оператор ⊛ (v3.0) — поведение + дистилляция + ⊘ vs ℋ
python3 mmss_fractal_generator.py

# 6. Ollama-swap (автодетект; без Ollama — fallback)
python3 mmss_ollama_swap.py

# 7. Ollama pipeline (retrain ℋ со swapped teacher → ⊘)
python3 mmss_ollama_pipeline.py

# 8. Интеграция с Мета-Кристаллом (round-trip с реальным репо-форматом)
python3 mmss_meta_crystal_bridge.py
```

### Локально с Ollama (опционально, для реальной семантики)
```bash
ollama pull embeddinggemma:300m   # энкодер
ollama pull qwen2.5-3b            # учитель
# шаги 6–7 автоматически переключатся на mode=ollama_real
```

---

## Интеграция с meta-crystal-abstract-researcher

`mmss_meta_crystal_bridge.py` делает MMSS-сессию **движком проявления над реальной
базой кристаллов** репозитория:

**Чтение** — `MetaCrystalStore.read_all()` рекурсивно читает
`data/meta_crystals/crystals/**/*.json`, каждый кристалл → узел MMSS:
`crystal.combination` (формула) → encoder → z_q → invariant.

**Запись** — обнаруженный ⊘-мост (узел, касающийся ≥2 stable-кластеров) материализуется
как **manifested-diamond** в формате репозитория и пишется в
`data/meta_crystals/crystals/manifested/MMSS-{hex}.json`:
```json
{
  "meta": { "code": "MMSS-...", "type": "diamond", "category": "manifested",
            "generation": "synthetic", "parents": ["TOPO-0129", "QUAN-0108"] },
  "crystal": { "focus":..., "elements": [donor codes],
               "operators": [{⊘}, {↯}], "combination": "[A] ⊘ [B] ↯",
               "metrics": { "invariant": [...], "dominant_axis":.., "touched_clusters":[..] } },
  "classification": { "type": "diamond", "reasons": ["MMSS ⊘ isomorphism bridge..."] },
  "llm_micro_note": "...", "vector_direction": "...", "llm_synthesis_reasoning": "..."
}
```
Это точно совместимо с `src/lib/manifestation.ts` (`normalizeSyntheticCrystal` +
`saveSyntheticCrystal`) — manifested-diamond подхватится UI, счётчиками алмазов и
индексацией эмбеддингов репозитория.

**Изоморфизмы** — мост добавляет рёбра в `data/meta_crystals/isomorphisms.json`
(граф `{ code: [{target_id, strength, evidence}] }`), читаемый эндпоинтом
`GET /isomorphisms/{id}`.

### Куда встроить в рабочий процесс репозитория
1. **Источник узлов для ⊘**: realtime-сессия читает `data/meta_crystals/crystals/`
   (текущие ~3000 кристаллов) → живой граф изоморфизмов вместо полного скана.
2. **Шаг проявления (step3/diffuse)**: мосты MMSS = готовые доноры-кандидаты для
   `include_isomorphic_donors` — структурные связи в invariant-space, а не только
   lexical overlap.
3. **Embedding-совместимость**: `MetaCrystalStore` + `OllamaEncoder` используют тот же
   `/api/embeddings` и модели (`embeddinggemma:300m`, `qwen2.5-3b`), что и
   `src/lib/llm/ollama.ts` — один Ollama обслуживает и репо, и MMSS.
4. **Альтернативное ядро ⊛**: `FractalMMSSCore` может заменить линейную ℋ для
   multi-scale depth-экспериментов над той же базой кристаллов.

---

## Честные границы (что реализовано / что нет)

**Реализовано и измерено:**
- matrix-free ядро ℋ (param_count const при росте запросов)
- дистилляция ℋ (test MSE −92%, invariant-space разделим: same-domain 0.99 / diff 0.14)
- оператор ⊘ (F1 0.14→0.72 после обучения; на синтетике)
- оператор ⊛ — реальный самоподобный генератор (convergence, depth-drift, дистиллируем; на ⊘ проигрывает ℋ — честно)
- Ollama interface + pipeline mechanics (верифицировано через fallback)
- round-trip с форматом Мета-Кристалла (read crystal → invariant → bridge → manifested diamond + isomorphisms.json)

**Не выполнено в сэндбоксе / не доказано:**
- реальный вызов Ollama (encoder+teacher) — fallback only; локально авто-swap
- превосходство ⊛ над ℋ (на синтетике проигрывает по F1)
- полная quantum-fractal топология v3.0 (⊛ — одна идея, не весь v3.0)
- семантическое решение изоморфизмов на РЕАЛЬНЫХ данных (всё ещё синтетика/feature-hash)
  → **gate**: swap на Ollama + реальный LLM-учитель, ретест ⊘ на реальных кристаллах
