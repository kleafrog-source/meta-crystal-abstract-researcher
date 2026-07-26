# TASK: Интеграция MMSS-движка в Мета-Кристалл (real-data gate)

## Контекст

В `python_engine/mmss/` лежит CPU-only, matrix-free движок инвариантных вычислений
(MMSS = Meta Meta System Synthezator) + операторы ℋ ⊛ ⊕ ⊘ ↯. Сейчас он валиден только
на синтетике (feature-hash encoder + synthetic teacher). Цель интеграции — проверить
его на РЕАЛЬНОЙ базе кристаллов репозитория и понять: реальный потенциал или концепт.

Репозиторий: Next.js + Prisma/SQLite + Ollama. Python-сторона — sidecar
(`python_engine/sidecar.py`), вызывается как `python3 python_engine/sidecar.py <cmd>`,
общается newline-delimited JSON через stdout. Данные: `data/meta_crystals/crystals/`
(raw + `manifested/`), `data/meta_crystals/isomorphisms.json`. Ollama-провайдер (TS):
`http://localhost:11434`, embed `/api/embeddings` (модель `embeddinggemma:300m`, 384-dim),
chat `/api/chat` (модель `qwen2.5-3b`) — см. `src/lib/llm/ollama.ts`.

MMSS уже совместим по формату кристаллов с `src/lib/manifestation.ts`
(`normalizeSyntheticCrystal`/`saveSyntheticCrystal`): пишет manifested-diamond
(`meta.type=diamond, category=manifested, generation=synthetic, parents=[donors]`,
операторы ⊘↯, `metrics.invariant`) в `manifested/{MMSS-xxxx}.json` + рёбра в
`isomorphisms.json`.

---

## Что нужно сделать (по шагам)

### Шаг 0. Зависимости
- В `requirements.txt` ДОБАВИТЬ `torch` (CPU): строку `torch` или инструкцию
  `pip install torch --index-url https://download.pytorch.org/whl/cpu`.
- Убедиться, что `python_engine/mmss/` импортируется: в `sidecar.py` уже есть
  `BASE_DIR = Path(__file__).resolve().parent`; добавить `sys.path.insert(0, str(BASE_DIR / "mmss"))`
  вверху `sidecar.py` (после `PROJECT_ROOT`), чтобы `import mmss_meta_crystal_bridge as mcb` работал.

### Шаг 1. Wiring в sidecar — новые команды
Добавить в `python_engine/sidecar.py` (по существующей конвенции `cmd_*` + dispatch в `main()`):

| Команда | Что делает |
|---|---|
| `mmss_status` | Вернуть `{torch_ok, checkpoint_loaded, ollama_detected, ollama_mode, n_crystals_in_base}`. |
| `mmss_ingest_all` | `MetaCrystalStore(str(CRYSTALS_DIR.parent.parent))` (т.е. data_root = `PROJECT_ROOT/"data"`); `read_all()` → ingest каждого кристалла (combination→z_q→invariant→⊘/↯) → вернуть `{n_nodes, n_bridges, n_manifested_diamonds, ui_snapshot}`. manifested diamonds пишутся в `manifested/`, рёбра в `isomorphisms.json`. |
| `mmss_ingest_code <code>` | Ingest одного кристалла по code (для UI Mosaic-Topologies в реальном времени). |
| `mmss_eval` | Запуск плана тестов (Шаг 3) → вернуть JSON-отчёт. |

Для каждой команды: использовать существующие `emit_log/emit_progress/emit_data/emit_done`
(sidecar-протокол). data_root = `PROJECT_ROOT / "data"`.
checkpoint = `BASE_DIR / "mmss" / "v22_hyper_synthetic_distilled.pt"`.

### Шаг 2. Реальный Ollama encoder + teacher → retrain ℋ (КЛЮЧ к real-data)
Это главный шаг. Сейчас encoder = feature-hash (по токенам), teacher = synthetic (one-hot по
6 доменам по ключевым словам). Оба — заглушки. Их надо заменить на реальные и ПЕРЕОБУЧИТЬ ℋ.

**Процесс teacher/retrain (простыми словами):**
1. **Encoder** даёт координату z_q из текста кристалла (combination+focus+elements).
   - Сейчас: `FeatureHashEncoder` — хэш токенов в фиксированный вектор (не понимает семантику).
   - Меняем на: `OllamaEncoder` (`mmss_ollama_swap.py`) — `POST /api/embeddings {model:"embeddinggemma:300m", prompt:<text>}` → 384-dim. Тот же endpoint/модель, что использует `src/lib/llm/ollama.ts`. z_q становится реальной семантической координатой.
2. **Teacher** даёт «идеальный инвариант» для каждого запроса — цель, к которой ℋ должна стремиться.
   - Сейчас: `SyntheticTeacher` — присваивает домен по ключевику, выдаёт one-hot. ℋ учится кластеризовать по ключевикам (это НЕ семантика).
   - Меняем на: `OllamaTeacher` — `POST /api/chat {model:"qwen2.5-3b", messages:[{role:system, content:"Ты — учитель инвариантного пространства. Дан кристалл (focus/elements/operators/combination). Верни JSON: массив из K=16 чисел [-1..1] — структурный отпечаток: полярность операторов, баланс элементов, сложность. Одинаковые структурные идеи → близкие векторы."},{role:user, content:<crystal json>}], format:"json"}` → парсим массив → целевой invariant.
3. **Retrain** = прогнать `mmss_distill_isomorphism.py`-стиль цикл (функция `distill()` / `mmss_ollama_pipeline.quick_distill`), но с `make_encoder("ollama")` + `make_teacher("ollama")`. ℋ учится воспроизводить LLM-инварианты из реальных embeddings. Новый checkpoint: `v22_hyper_ollama_distilled.pt`.
4. **⊘ на реальных кристаллах**: загрузить новый checkpoint в `MetaCrystalRealtimeSession`, ingest всю базу (`mmss_ingest_all`). Теперь мосты строятся на реальных семантических инвариантах, а не на ключевых словах.

Реализовать это как новую sidecar-команду `mmss_retrain` (params: `{n_pairs, epochs, out_checkpoint}`)
+ опционально CLI-скрипт `python_engine/mmss/retrain_ollama.py`. Использовать готовые
контракты из `mmss_ollama_swap.py` (`make_encoder`, `make_teacher`, `detect_ollama`).
Грейсфолл: если Ollama недоступен — вернуть ошибку/предложить `ollama serve`, НЕ падать в silent fallback для этой команды (retrain без реального teacher не имеет смысла).

### Шаг 3. План тестов и оценка (real-data gate)
Реализовать в `cmd_mmss_eval` (или `python_engine/mmss/run_eval.py` → пишет `data/meta_crystals/mmss_eval_report.json`):

**A. Baseline vs Ollama (главный A/B)**
- Запустить `mmss_ingest_all` ДВАЖДЫ: (1) с synthetic encoder+teacher (checkpoint `v22_hyper_synthetic_distilled.pt`), (2) с Ollama encoder+teacher (checkpoint `v22_hyper_ollama_distilled.pt`).
- Сравнить граф изоморфизмов: сколько мостов совпало, сколько новых дал Ollama, плотность, распределение strength.

**B. Cluster coherence (прокси-F1, т.к. ground-truth меток на реальных кристаллах нет)**
- Кластеризовать ℋ-invariants реальных кристаллов (например agglomerative по косинусу).
- Метрики: silhouette score; purity по известным мета-меткам (operator symbol ⊗/⊕/⊘, focus.category, meta.type). Высокая purity = кластеры осмысленны.

**C. Labeled probe (честный F1)**
- Собрать вручную или через LLM мини-разметку: 50 пар кристаллов, метка isomorphic={0,1}
  (isomorphic = общий операторный скелет / структурная идея, НЕ просто общие слова).
- Замерить ⊘ precision/recall/F1 на этих парах для обоих checkpoint'ов. Это единственная
  честная «реальная» метрика качества алгоритма.

**D. Bridge spot-check (человек)**
- Из manifested diamonds взять 20 шт, для каждого: родители действительно изоморфны (да/нет)?
  Дать оценку % осмысленных мостов.

**E. Scale/latency**
- Время `mmss_ingest_all` на полной базе (~N кристаллов). Зафиксировать O(N²) предел;
  если N>2000 и >неск. секунд — отметить необходимость ANN/HNSW/FAISS (см. README «scale_caveat»).

**Критерий вердикта (потенциал vs концепт):**
- REAL: C-F1 ≥ ~0.5 на размеченных парах И B-silhouette заметно выше random И ≥50% мостов в D осмысленны И Ollama-swap (A) содержательно меняет граф (не просто reshuffle).
- CONCEPT: F1~random, кластеры = ключевиковые артефакты, Ollama-swap не меняет картину, мосты шумные.
- В отчёт явно записать вердикт одной строкой + все метрики.

---

## Файлы и пути (готово к drop-in)

Папка `python_engine/mmss/` уже содержит:
```
mmss_cycle.schema.json            # JSON-контракт цикла
mmss_v22_core.py                  # ядро v2.2: encoder, ℋ hypernetwork, InvariantNet, render
mmss_distill_isomorphism.py       # дистилляция ℋ, оператор ⊘, ↯ переходы, кристаллы
mmss_realtime_session.py          # realtime: ℋ из ckpt → ⊘/↯/кластеры, adaptive threshold
mmss_fractal_generator.py         # оператор ⊛ (v3.0) — для опционального A/B ядра
mmss_ollama_swap.py               # pluggable Encoder/Teacher + OllamaEncoder/OllamaTeacher
mmss_ollama_pipeline.py           # detect Ollama → swap → retrain → ⊘
mmss_meta_crystal_bridge.py       # MetaCrystalStore + MetaCrystalRealtimeSession (read/write repo-format)
v22_hyper_synthetic_distilled.pt  # обученная ℋ (synthetic baseline)
README.md                         # архитектура, порядок запуска, честные границы
```
Пути в `mmss_meta_crystal_bridge.py` уже сделаны module-relative (`Path(__file__).parent`),
так что пакет работает из любого места. data_root для sidecar-команд = `PROJECT_ROOT/"data"`
(= `data/meta_crystals/crystals/...`), что совпадает с `CRYSTALS_DIR` в `sidecar.py`.

## Порядок запуска (для проверки после интеграции)
```bash
ollama pull embeddinggemma:300m
ollama pull qwen2.5-3b
pip install torch --index-url https://download.pytorch.org/whl/cpu

# smoke (синтетика, не трогает реальную базу — пишет в mmss/demo_data/):
cd python_engine/mmss && python3 mmss_meta_crystal_bridge.py

# real-data gate через sidecar (Codex реализует эти команды):
python3 python_engine/sidecar.py mmss_status
python3 python_engine/sidecar.py mmss_retrain '{"n_pairs":400,"epochs":300,"out_checkpoint":"python_engine/mmss/v22_hyper_ollama_distilled.pt"}'
python3 python_engine/sidecar.py mmss_ingest_all        # на реальной базе
python3 python_engine/sidecar.py mmss_eval             # отчёт + вердикт
```

## Честные границы (что НЕ доказано до теста)
- Сейчас ВСЕ метрики (⊘ F1=0.72 и т.д.) — на синтетике. На реальных кристаллах НЕ измерялись.
- ⊛ (fractal generator) на синтетике проигрывает ℋ по F1 — это опциональный A/B, не основная линия.
- Полная UI/DB/счётчики/эмбеддинги синхронизируются только после того, как репозиторий
  прогонит `syncCrystalsFromIndex()` + `indexManifestEmbeddings()` над записанными
  manifested-diamonds (MMSS пишет файлы в правильном формате, но Prisma/UI обновляются
  через существующий sync-путь репо). При необходимости — добавить хук в `cmd_import_apply`
  или post-retrain триггер.
```
