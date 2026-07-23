```markdown
# TASK.md: Режим «Проявление» (Manifestation Mode) для MMSS

## 1. Контекст и Философия
В приложении уже накоплено ~3000 кристаллов (JSON), но их метрики (`quality_score`, `V`, `S`, `N` и др.) отключены или недостоверны. 
**Задача:** Реализовать трёхшаговый API-режим «Проявление», который позволяет LLM (через Ollama) постепенно раскрывать потенциал кристаллов без жёстких фильтров. 

**Философия режима:** Это не конвейерная сортировка, а процесс проявления, как в фотографии:
1. **Слепое касание:** LLM видит только формулу (`combination`) и оставляет интуитивную микрозаметку (2–5 слов). Меньше контекста = чище интуиция.
2. **Проявление вероятностей:** LLM видит полный JSON + микрозаметку и определяет вектор движения и точки мутации.
3. **Палитра и диффузия:** Накопленные заметки и векторы становятся палитрой для семантического поиска и синтеза новых кристаллов.

**Главный принцип:** Случайное становится неслучайным через ритм, а не через фильтр.

---

## 2. Интеграция с существующим UI (КРИТИЧНО)
Новый режим должен бесшовно встроиться в текущее приложение:
1. **Совместимость с Пайплайнами:** Endpoints режима «Проявление» должны быть доступны для вызова через существующий интерфейс «Сгенерировать пайплайн». Пользователь выбирает профиль проявления, а система использует уже настроенные в UI параметры LLM (модель, температура).
2. **Синхронизация со счётчиками:** При успешном синтезе нового кристалла в `/step3/diffuse`, поле `meta.type` должно быть установлено в `"diamond"` (или `"emerald"`), а `quality_score` должен быть вычислен. Это обеспечит автоматическое увеличение счётчиков «Алмазов»/«Изумрудов» на дашборде.
3. **Отображение в карточке:** Фронтенд должен отображать новые поля `llm_micro_note` и `vector_direction` в карточке кристалла (например, в виде небольших цветных тегов или всплывающих подсказок рядом с формулой), чтобы пользователь мог визуально использовать их как «палитру».

---

## 3. Исходные данные
Кристаллы хранятся как JSON-файлы. Структура:
```json
{
  "meta": { "code": "AXC0R-e2b", "type": "hybrid", "category": "hybrids", "counter": 2644, "step": 0, "datetime": "2026-07-17T08:55:37.458938", "generation": 0 },
  "crystal": {
    "focus": { "type": "categorical", "word": "сопряжение_категорное", "category": "focus" },
    "pattern": "рефлексивный",
    "elements": ["элемент_1", "элемент_2"],
    "operators": [{ "key": "умножение", "symbol": "⊗", "type": "math", "arity": 2, "priority": 2 }],
    "combination": "A ⊗ ∂/∂t [ B ⊕ C ] ^ D",
    "complexity": 18, "quality_score": 0, "metrics": {}
  },
  "classification": { "type": "hybrid", "reasons": ["Автоматическая классификация"] }
}
```
Имя файла = `{meta.code}.json`.

---

## 4. Технологический стек
- **FastAPI** + **uvicorn** (HTTP-сервер)
- **ollama** Python-клиент (вызов LLM)
- **Pydantic v2** (валидация схем)
- **asyncio** (асинхронные вызовы)
- **Существующие в проекте:** модель эмбеддингов, векторное хранилище, система снапшотов, механизм оценки `quality_score`.

---

## 5. Файловая структура
```text
mmss-manifest/
├── main.py                    # FastAPI приложение, роутинг
├── endpoints/
│   ├── step1.py               # POST /step1/micro_notes
│   ├── step2.py               # POST /step2/manifest
│   ├── step3.py               # GET /step3/palette_query, POST /step3/diffuse
│   ├── crystals.py            # GET /crystals/{id}, GET /crystals/list
│   ├── embeddings.py          # POST /embeddings/index, POST /embeddings/search
│   └── isomorphisms.py        # GET /isomorphisms/{id}, POST /isomorphisms/scan
├── core/
│   ├── llm_client.py          # Обёртка над ollama.chat()
│   ├── json_handler.py        # Чтение/запись JSON (атомарно: temp + replace)
│   ├── prompts.py             # Константы-промпты
│   ├── schemas.py             # Pydantic-схемы запросов/ответов
│   ├── embeddings.py          # Обёртка над существующей моделью эмбеддингов проекта
│   └── isomorphisms.py        # Детектор изоморфизмов (семантика + элементы + операторы)
├── data/
│   ├── raw/                   # Исходные кристаллы
│   ├── diamonds/              # Синтезированные кристаллы
│   └── isomorphisms.json      # Граф изоморфизмов
└── requirements.txt
```

---

## 6. Pydantic-схемы (`core/schemas.py`)

### Входящие:
```python
class MicroNotesRequest(BaseModel):
    crystal_ids: list[str] = Field(..., min_length=1, max_length=10)
    temperature: float = Field(default=0.75, ge=0.0, le=2.0)

class ManifestRequest(BaseModel):
    crystal_ids: list[str] = Field(..., min_length=1)
    temperature: float = Field(default=0.45, ge=0.0, le=2.0)
    include_isomorphs: bool = Field(default=False)

class PaletteQueryParams(BaseModel):
    q: str | None = None                    # поиск по llm_micro_note (подстрока)
    vector: str | None = None               # поиск по vector_direction (подстрока)
    semantic_query: str | None = None       # семантический поиск по эмбеддингам
    has_micro_note: bool | None = None      
    has_vector: bool | None = None          
    limit: int = Field(default=50, ge=1, le=500)

class DiffuseRequest(BaseModel):
    donor_ids: list[str] = Field(..., min_length=2, max_length=5)
    temperature: float = Field(default=0.6, ge=0.0, le=2.0)
    guidance: float = Field(default=0.6, ge=0.0, le=1.0)  # степень наследования
    superposition_size: int = Field(default=1, ge=1, le=20)
    collapse_mode: str = Field(default="best", pattern="^(best|diverse|manual)$")
    include_isomorphic_donors: bool = Field(default=False)

class EmbeddingsIndexRequest(BaseModel):
    crystal_ids: list[str] | None = None
    force_reindex: bool = False

class IsomorphScanRequest(BaseModel):
    threshold: float = Field(default=0.8, ge=0.0, le=1.0)
    crystal_ids: list[str] | None = None
```

### Исходящие:
```python
class MicroNoteResult(BaseModel): id: str; note: str
class MicroNotesResponse(BaseModel): status: str; processed: int; results: list[MicroNoteResult]

class ManifestResult(BaseModel): id: str; vector_direction: str; mutation_probabilities: list[str]
class ManifestResponse(BaseModel): status: str; results: list[ManifestResult]

class PaletteCrystal(BaseModel): id: str; micro_note: str | None; vector_direction: str | None; similarity: float | None = None
class PaletteResponse(BaseModel): status: str; found: int; crystals: list[PaletteCrystal]

class DiffuseCandidate(BaseModel): crystal: dict; guidance_used: float; quality_score: float | None = None
class DiffuseResponse(BaseModel): 
    status: str; new_crystal_id: str; saved_to: str; synthesis_reasoning: str
    candidates_count: int; collapse_mode: str; all_candidates: list[DiffuseCandidate] | None = None

class IsomorphResult(BaseModel): target_id: str; strength: float; evidence: str
class IsomorphResponse(BaseModel): status: str; crystal_id: str; isomorphs: list[IsomorphResult]
```

---

## 7. Endpoints (Детальная логика)

### 7.1 `POST /step1/micro_notes`
1. Прочитать `data/raw/{id}.json` для каждого ID. Игнорировать ненайденные.
2. Извлечь **только** `meta.code` и `crystal.combination`.
3. Сформировать промпт `STEP1_PROMPT`. Вызвать LLM (`format='json'`, `temperature` из запроса).
4. Распарсить ответ как `list[MicroNoteResult]`. При ошибке парсинга — повтор (макс. 2 раза).
5. Атомарно дописать поле `"llm_micro_note"` в корень каждого JSON (`write to temp → os.replace`).
6. Вернуть `MicroNotesResponse`.

### 7.2 `POST /step2/manifest`
1. Прочитать JSON. Если нет `llm_micro_note` → HTTP 422.
2. Если `include_isomorphs=True`, получить список изоморфных кристаллов из `data/isomorphisms.json`.
3. Сформировать промпт `STEP2_PROMPT` (с секцией изоморфизмов, если есть).
4. Вызвать LLM **по одному кристаллу за раз** (изолированный контекст).
5. Распарсить ответ как `ManifestResult`. Атомарно дописать `"vector_direction"` и `"mutation_probabilities"`.
6. **Автоматически** вызвать внутреннюю индексацию эмбеддингов для этого кристалла.
7. Вернуть `ManifestResponse`.

### 7.3 `GET /step3/palette_query`
1. Просканировать JSON в `data/raw/` и `data/diamonds/`.
2. Применить фильтры `has_micro_note`, `has_vector`, `q` (подстрока), `vector` (подстрока).
3. Если задан `semantic_query` → выполнить семантический поиск через `core.embeddings.search_similar`, вернуть топ-K по cosine similarity.
4. Вернуть `PaletteResponse` (до `limit`).

### 7.4 `POST /step3/diffuse`
1. Прочитать полные JSON `donor_ids`. Если `include_isomorphic_donors=True`, расширить список доноров изоморфными кристаллами (макс. 5).
2. Цикл `superposition_size` раз:
   - Случайно выбрать `guidance_candidate` в диапазоне `[guidance - 0.15, guidance + 0.15]` (обрезка до [0, 1]).
   - Сформировать промпт `STEP3_PROMPT` с `guidance_percent = int(guidance_candidate * 100)`.
   - Вызвать LLM с `temperature + случайное_смещение_до_0.1`.
   - Распарсить ответ как полный кристалл.
   - Вычислить `quality_score` через существующий механизм оценки проекта.
3. **Коллапс:**
   - `best`: выбрать кандидата с наивысшим `quality_score`.
   - `diverse`: выбрать топ-3 с максимальным разнообразием по эмбеддингам `combination`.
   - `manual`: вернуть всех кандидатов в `all_candidates`.
4. Сгенерировать `meta.code` = `SYNTH-{6 hex}`. Установить `meta.type = "diamond"`, `meta.generation = "synthetic"`, `meta.parents = donor_ids`.
5. Валидировать через Pydantic, сохранить в `data/diamonds/`.
6. Вернуть `DiffuseResponse`.

### 7.5 `POST /embeddings/index`
1. Если `crystal_ids` не задан, взять все кристаллы.
2. Для каждого: если `force_reindex=False` и эмбеддинг есть → пропустить. Иначе: вычислить эмбеддинг конкатенации `llm_micro_note + " " + vector_direction + " " + combination` (пропуская пустые поля) и сохранить в векторное хранилище проекта.

### 7.6 `POST /embeddings/search`
1. Вычислить эмбеддинг `query`.
2. Выполнить семантический поиск через `core.embeddings.search_similar` с применением `filter` (если задан).
3. Вернуть топ-`limit` результатов.

### 7.7 `POST /isomorphisms/scan`
1. Для каждой пары кристаллов вычислить: 
   - Семантическое сходство `combination` (вес 0.5)
   - Пересечение `elements` (вес 0.3)
   - Сходство `operators` по символам (вес 0.2)
2. Если итоговая сила ≥ `threshold`, записать ребро в `data/isomorphisms.json`.

### 7.8 `GET /isomorphisms/{crystal_id}`
1. Прочитать `data/isomorphisms.json`. Вернуть список изоморфных кристаллов для данного ID.

---

## 8. Промпты (`core/prompts.py`)

### STEP1_PROMPT
```text
Ты — наблюдатель абстрактных форм. Перед тобой {n} формул. Не анализируй их смысл.
Посмотри на них как на музыкальные партитуры или геометрические фигуры.
Для каждой оставь одну микрозаметку на полях (2–5 слов): какую форму, ритм или движение она вызывает?
Примеры: "замкнутая спираль", "ритмичный распад", "взрыв из точки", "тихая стабилизация".
Верни СТРОГО JSON-массив:
[{{"id": "<code>", "note": "<заметка>"}}, ...]
Формулы:
{formulas}
```

### STEP2_PROMPT
```text
Учитывая микрозаметку "{micro_note}" и полную структуру этого кристалла, прояви его вероятности. Не оценивай его.
Определи:
1) vector_direction — вектор направленности (куда он эволюционирует, если его "отпустить"? 1 предложение).
2) mutation_probabilities — две вероятные точки мутации: какой ОДИН элемент или ОДИН оператор, если его добавить или заменить, раскроет его потенциал? (массив из 2 строк).

{isomorphs_section}

Верни СТРОГО JSON:
{{
  "vector_direction": "...",
  "mutation_probabilities": ["...", "..."]
}}
Кристалл:
{crystal_json}
```
*(Если `include_isomorphs=True`, в `{isomorphs_section}` подставляется: "Структурные изоморфизмы этого кристалла (для подсказки): {isomorphs_list}. Используй это, чтобы предложить мутации, связывающие скрытые домены.")*

### STEP3_PROMPT
```text
Ты — алхимик формул. Перед тобой {n} кристаллов-доноров.
Используй их микрозаметки как эмоциональный клей, а их векторы — как направление новой формулы.
Степень наследования от доноров: {guidance_percent}%. (0% = полная свобода, 100% = строгое сохранение структуры).

Создай НОВЫЙ кристалл:
- focus: объедини суть фокусов доноров.
- elements: выбери резонирующие. Допускается фрактальная мутация: замена на семантически близкий, добавление суффикса/префикса, или объединение двух в один гибридный.
- operators: выбери те, что структурно связывают разнородные элементы.
- combination: напиши формулу, отражающую синтез, а не склейку.
- Обоснуй в поле "llm_synthesis_reasoning", почему эта формула не могла быть получена простым перебором.

Верни СТРОГО JSON, полностью повторяющий структуру кристалла MMSS (поля meta, crystal, classification) + поле llm_synthesis_reasoning. Поле meta.code оставь пустой строкой.
Доноры:
{donors_json}
```

---

## 9. Core Утилиты (Абстрактные интерфейсы)

### `core/embeddings.py`
```python
def embed_text(text: str) -> list[float]:
    """Вычисляет эмбеддинг текста через существующую модель проекта."""
    pass

def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Косинусное сходство."""
    pass

def index_crystal(crystal_id: str, text: str, metadata: dict):
    """Сохраняет эмбеддинг в векторное хранилище проекта."""
    pass

def search_similar(query_embedding: list[float], limit: int, filter: dict | None = None) -> list[dict]:
    """Семантический поиск по векторному хранилищу."""
    pass
```

### `core/isomorphisms.py`
```python
def compute_similarity(crystal_a: dict, crystal_b: dict) -> tuple[float, str]:
    emb_a = embed_text(crystal_a["crystal"]["combination"])
    emb_b = embed_text(crystal_b["crystal"]["combination"])
    semantic_sim = cosine_similarity(emb_a, emb_b)
    
    elems_a, elems_b = set(crystal_a["crystal"]["elements"]), set(crystal_b["crystal"]["elements"])
    elem_overlap = len(elems_a & elems_b) / max(len(elems_a | elems_b), 1)
    
    ops_a = set(op["symbol"] for op in crystal_a["crystal"]["operators"])
    ops_b = set(op["symbol"] for op in crystal_b["crystal"]["operators"])
    op_overlap = len(ops_a & ops_b) / max(len(ops_a | ops_b), 1)
    
    strength = 0.5 * semantic_sim + 0.3 * elem_overlap + 0.2 * op_overlap
    evidence = f"shared_elements={list(elems_a & elems_b)[:3]}, shared_operators={list(ops_a & ops_b)[:3]}"
    return strength, evidence
```

---

## 10. Обработка ошибок
- Файл не найден → HTTP 404
- Нет `llm_micro_note` в Шаге 2 → HTTP 422
- LLM вернула невалидный JSON → повтор до 2 раз, затем HTTP 502
- Pydantic-валидация не прошла → HTTP 422
- Векторное хранилище недоступно → HTTP 503

---

## 11. Критерии приемки (Checklist)

### Базовые:
- [ ] `/step1/micro_notes` добавляет `llm_micro_note` в JSON.
- [ ] `/step2/manifest` добавляет `vector_direction` и `mutation_probabilities`.
- [ ] `/step2/manifest` без `llm_micro_note` возвращает 422.
- [ ] `/step3/palette_query?q=...` фильтрует по подстроке.
- [ ] `/step3/diffuse` создаёт валидный JSON в `data/diamonds/` с `meta.type = "diamond"`.
- [ ] Исходные поля кристаллов не модифицируются. Запись атомарна (temp + replace).

### Расширения (Roadmap):
- [ ] `/embeddings/index` индексирует кристаллы в существующее векторное хранилище.
- [ ] `/step3/palette_query?semantic_query=...` возвращает результаты семантического поиска.
- [ ] `/step2/manifest?include_isomorphs=true` включает секцию изоморфизмов в промпт.
- [ ] `/step3/diffuse?superposition_size=5` генерирует 5 кандидатов.
- [ ] `/step3/diffuse?collapse_mode=diverse` возвращает топ-3 разнообразных кандидатов.
- [ ] `/step3/diffuse?guidance=0.9` передаёт высокую степень наследования в промпт.
- [ ] `/isomorphisms/scan` находит и сохраняет изоморфизмы в `data/isomorphisms.json`.

---

## 12. Дух режима (Для Codex)
Это **не** система сортировки. Это процесс **проявления**. Агент — не оценщик, а **дирижер**. Он нажимает на кнопки (вызывает endpoints), а LLM на каждом шаге видит ровно столько, сколько нужно. Меньше контекста — чище интуиция. 
**Главный принцип:** случайное становится неслучайным через ритм, а не через фильтр. Все расширения должны усиливать этот ритм, а не заменять его жёсткой инженерией.
```