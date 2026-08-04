# Мета-Кристалл v7.2 — Веб-приложение

Веб-реализация десктопного GUI «Мета-Кристалл» на базе Next.js 16 + TypeScript с интеграцией локальных LLM (Ollama), RAG-пайплайна и векторного поиска по базе знаний движка.

## Архитектура

```
┌──────────────────────────────────────────────────────────────┐
│                  Next.js 16 (App Router)                     │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐  │
│  │  React UI       │ ←→ │  Next.js API Routes             │  │
│  │  (8 страниц)    │    │  /api/dashboard, /api/crystals   │  │
│  │  Tailwind +     │    │  /api/generate, /api/pipelines   │  │
│  │  shadcn/ui      │    │  /api/llm/*, /api/settings       │  │
│  │  Dark theme     │    │  /api/import, /api/enrich        │  │
│  └─────────────────┘    └────────────┬─────────────────────┘  │
│                                      │                        │
│                       ┌──────────────┴───────────────┐        │
│                       │  TypeScript Service Layer    │        │
│                       │  • LLM providers (Ollama/Mock)│       │
│                       │  • RAG pipeline              │        │
│                       │  • Sidecar runner (subprocess)│       │
│                       │  • Crystal indexer           │        │
│                       └──────────────┬───────────────┘        │
│                                      │                        │
│                              ┌───────┴────────┐               │
│                              │ Python sidecar │               │
│                              │ (sidecar.py)   │               │
│                              └───────┬────────┘               │
│                                      │                        │
│                       ┌──────────────┴───────────────┐        │
│                       │  Existing Python Engine      │        │
│                       │  • metacrystal_engine_v7.py  │        │
│                       │  • import_engine.py          │        │
│                       │  • enrichment_v3.py          │        │
│                       │  • pipeline_engine.py        │        │
│                       └──────────────────────────────┘        │
│                                                              │
│  Storage:                                                    │
│   • Prisma + SQLite (DB)                                    │
│   • data/meta_crystals/ (engine file output)                │
│   • data/.temp/ (profile JSON for sidecar calls)            │
└──────────────────────────────────────────────────────────────┘
```

## Реализованный функционал

### Страницы UI

| Страница       | Описание                                                    |
|----------------|-------------------------------------------------------------|
| **Дашборд**    | Статистика кристаллов, последние алмазы, запуски пайплайнов |
| **Генерация**  | Профиль параметров + 74 флага доменов + live-лог (SSE)      |
| **Пайплайны**  | CRUD + конструктор шагов + запуск с потоковым логом         |
| **Библиотека** | Таблица с фильтрами, семантический поиск, детальная панель  |
| **Импорт**     | Загрузка JSON + diff-предпросмотр + применение              |
| **Обогащение** | Запуск EnricherV3, поиск изоморфизмов, лог                  |
| **LLM-чат**    | RAG-чат с Ollama/Mock, генерация пайплайнов из запроса      |
| **Настройки**  | Выбор провайдера, моделей, температуры, индексация базы     |

### API эндпоинты

```
GET    /api/engine                  — информация о движке (74 домена, 196 операторов)
GET    /api/dashboard               — агрегированная статистика
GET    /api/crystals                — список с пагинацией, фильтрами, семантическим поиском
GET    /api/crystals/[id]           — детали кристалла
DELETE /api/crystals/[id]           — удаление записи
POST   /api/crystals/[id]/favourite — переключение избранного
POST   /api/generate/start          — запуск генерации (возвращает taskId)
GET    /api/generate/stream/[taskId]— SSE-стрим логов генерации
POST   /api/generate/stop/[taskId]  — остановка генерации (SIGTERM)
GET    /api/pipelines               — список пайплайнов
POST   /api/pipelines               — создание
GET    /api/pipelines/[id]          — детали
PUT    /api/pipelines/[id]          — обновление
DELETE /api/pipelines/[id]          — удаление
POST   /api/pipelines/[id]/run      — запуск пайплайна
POST   /api/import/upload           — загрузка файла (multipart)
POST   /api/import/preview          — diff-предпросмотр
POST   /api/import/apply            — применение импорта
POST   /api/enrich                  — запуск обогащения
GET    /api/enrich/status/[taskId]  — статус
POST   /api/llm/chat                — чат с RAG
POST   /api/llm/embed               — получить эмбеддинг
POST   /api/llm/interpret/[id]      — интерпретация кристалла
POST   /api/llm/generate_pipeline   — пайплайн из описания
POST   /api/llm/index_kb            — индексация базы знаний
GET    /api/llm/models              — список моделей Ollama
GET    /api/llm/messages            — история чата
GET    /api/profiles                — список профилей
POST   /api/profiles                — создание/обновление профиля
GET    /api/settings                — настройки LLM
PUT    /api/settings                — обновление настроек
```

## Запуск

### Разработка

```bash
bun install
bun run db:push      # создать SQLite-схему
bun run dev          # запуск Next.js на порту 3000
```

### Пересчет UMAP-карты

После того как у кристаллов уже есть `embedding`, можно предвычислить 2D-координаты для страницы `Map`:

```bash
npm run compute:umap
```

Поддерживаются env-параметры:

- `UMAP_N_NEIGHBORS` — число соседей, по умолчанию `15`
- `UMAP_MIN_DIST` — плотность локального уплотнения, по умолчанию `0.1`
- `UMAP_METRIC` — метрика расстояния, по умолчанию `cosine`

Результат записывается в поля `Crystal.umapX` и `Crystal.umapY`.

### Использование с Ollama

1. Запустите Ollama локально: `ollama serve`
2. Загрузите модели:
   ```bash
   ollama pull qwen2.5-3b
   ollama pull embeddinggemma:300m
   ```
3. В настройках выберите провайдер **Ollama** и нажмите «Обновить список моделей»
4. Нажмите «Индексировать» в разделе RAG для построения эмбеддингов базы знаний

Без Ollama приложение работает в режиме **Mock** — детерминированные ответы и хэш-based эмбеддинги.

## Структура проекта

```
src/
├── app/
│   ├── api/                    # Next.js API routes (route handlers)
│   │   ├── crystals/
│   │   ├── dashboard/
│   │   ├── engine/
│   │   ├── enrich/
│   │   ├── generate/
│   │   ├── import/
│   │   ├── llm/
│   │   ├── pipelines/
│   │   ├── profiles/
│   │   └── settings/
│   ├── globals.css             # Тёмная тема Meta-Crystal
│   ├── layout.tsx
│   └── page.tsx                # Главная (AppShell + переключение страниц)
├── components/
│   ├── icons.tsx               # Реэкспорт lucide-react иконок
│   ├── layout/
│   │   ├── AppShell.tsx
│   │   └── Sidebar.tsx
│   ├── pages/                  # 8 страниц приложения
│   │   ├── Dashboard.tsx
│   │   ├── Generation.tsx
│   │   ├── Pipelines.tsx
│   │   ├── Crystals.tsx
│   │   ├── Import.tsx
│   │   ├── Enrichment.tsx
│   │   ├── Chat.tsx
│   │   └── Settings.tsx
│   └── ui/                     # shadcn/ui компоненты
├── hooks/
│   ├── use-fetch.ts            # Хук + apiPost/apiPut/apiDelete
│   ├── use-toast.ts
│   └── use-mobile.ts
├── lib/
│   ├── db.ts                   # Prisma client
│   ├── engine/
│   │   ├── runner.ts           # Python sidecar runner (spawn + SSE)
│   │   └── sync.ts             # Синхронизация индекса движка с БД
│   ├── llm/
│   │   ├── types.ts            # LLMProvider интерфейс + cosineSimilarity
│   │   ├── ollama.ts           # Ollama HTTP client
│   │   ├── mock.ts             # Mock провайдер (fallback)
│   │   └── factory.ts          # Загрузка/сохранение настроек + buildProvider
│   └── rag/
│       └── index.ts            # RAG pipeline (embed + cosine search)
└── types/
    └── index.ts                # Общие доменные типы

python_engine/
├── sidecar.py                  # Python sidecar: spawn из Node.js
├── metacrystal_engine_v7.py    # Оригинальный движок (без изменений)
├── import_engine.py
├── enrichment_v3.py
├── pipeline_engine.py
└── merge_indices.py

prisma/
└── schema.prisma               # SQLite-схема (Crystal, Pipeline, ChatMessage, …)
```

## Связь с ТЗ

| Требование ТЗ                                | Реализация                                  |
|----------------------------------------------|---------------------------------------------|
| FastAPI backend                              | Next.js API Routes (TypeScript)             |
| PostgreSQL + pgvector                        | SQLite + JSON-stored embeddings + cosine   |
| Celery + Redis для фоновых задач             | child_process spawn + in-memory task registry |
| WebSocket для логов                          | Server-Sent Events (SSE)                    |
| LLMInterface (chat, embed, generate_completion) | LLMProvider interface + Ollama/Mock       |
| RAG: embed → search → context inject         | `buildRAGContext()` в `src/lib/rag/index.ts` |
| Семантический поиск по кристаллам            | `semanticSearchCrystals()` + cosine sim     |
| Автоматическое построение пайплайнов через LLM | `/api/llm/generate_pipeline` + save to DB   |
| Переключение LLM-провайдеров                 | Settings → `provider: "ollama" \| "mock"`   |
| Тёмная тема                                  | `globals.css` + OKLCH palette               |
| Docker-compose                               | (Не реализовано в прототипе — используется bun) |

## Известные упрощения

1. **SQLite вместо PostgreSQL+pgvector**: эмбеддинги хранятся как JSON-массивы в БД, cosine similarity считается в приложении. Для production-нагрузки нужен pgvector + HNSW.
2. **In-memory task registry вместо Redis**: задачи хранятся в `globalThis.__sidecarTasks`. Не работает в multi-instance деплое.
3. **SSE вместо WebSocket**: проще в реализации, достаточно для однонаправленных логов.
4. **Mock-провайдер**: детерминированные ответы на основе хэш-эмбеддингов. Полезен для разработки без Ollama.
5. **Pipeline engine**: вместо прямого использования `PipelineStep` (требует полный profile) реализован транслятор user-facing `{action, params}` → вызов `engine.evolve_with_saving`.

## Лицензия

Проект представляет собой прототип для замены десктопного GUI. Использует оригинальные Python-модули без модификаций.
