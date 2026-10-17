# Meta-Crystal v7.2

Локальная исследовательская среда для семантического поиска, синтеза и мультимодального сопоставления параметров звука. Интерфейс построен на Next.js 16 и React 19; вычислительные пайплайны работают через Python sidecar, Ollama и локальные CLAP/SigLIP2-модели.

## Основные режимы

| Режим | Назначение |
|---|---|
| **Flowmusic Genesis V3** | Независимый Single query, Transition A/B, retrieval по составной базе V3, live anchors/axes и готовый Clean Macro. |
| **Combinatorial Genesis** | Импорт и проверка новых батчей, карантин ошибок, построение composite index, anchors и служебных артефактов. |
| **Combinatorial Synthesis** | Без-LLM рекомбинация атомов, embedding-ранжирование, ручной/LLM-review и публикация кандидатов. |
| **Audio CLAP RAG** | Поиск параметров V3 по выбранному аудиофрагменту через LAION-CLAP. |
| **Audio-to-Parameter** | Автоматическая нарезка трека на временные узлы, последовательный поиск, сглаживание и воспроизводимая временная линия параметров. |
| **Morpho-Acoustic RAG** | Поиск параметров по изображению или спектрограмме через SigLIP2. |
| **Vocal Allocation Matrix** | Целевой подбор языков, TECH4/FX4, слоёв и пространственного распределения вокала. |
| **Cross-Modal Consensus** | Журнал и проверка согласия результатов semantic/audio/image retrieval. |
| **Meta-Crystal V3 Lab** | Куратор новых параметров из библиотеки Мета-Кристаллов. |
| **White Space / Knowledge Graph** | Анализ пробелов V3 и проверяемых связей параметров, атомов и таксономии. |

Подробности:

- [Руководство по режимам (RU)](docs/application-modes-guide-ru.md)
- [Application modes guide (EN)](docs/application-modes-guide.md)
- [Audio-to-Parameter: временная линия и поиск](docs/audio-to-parameter.md)

## Быстрый запуск

Требования: Node.js, `pnpm`, Python, Ollama. Большие модели и построенные индексы хранятся локально и не входят в Git.

```powershell
pnpm install
python -m pip install -r requirements.txt
pnpm run db:generate
pnpm run db:push
pnpm run dev
```

Откройте `http://localhost:3000`. Настройки моделей доступны в разделе **Настройки**. Текущий рекомендуемый лёгкий embedding-профиль — `qwen3-embedding:0.6b`; фактическая модель всегда берётся из сохранённых настроек и должна совпадать с моделью конкретного индекса.

Для локальных весов Hugging Face можно использовать отдельный диск:

```powershell
$env:HF_HOME = "D:\hfmodels"
$env:HF_HUB_CACHE = "D:\hfmodels\hub"
```

## Архитектура

```text
React UI (src/components/pages)
        │
Next.js API routes (src/app/api)
        │
TypeScript jobs / process management (src/lib)
        │
Python sidecar and pipelines (python_engine)
        │
V3 datasets and generated local indexes (data/combinatorial-genesis)
```

- `src/app/api` — маршруты поиска, импорта, индексации и управления задачами.
- `src/components/pages` — независимые интерфейсы режимов.
- `src/lib` — retrieval, управление Ollama/GPU, фоновые задания и общие типы.
- `python_engine` — CLAP, SigLIP2, anchoring, combinatorial и служебные пайплайны.
- `data/combinatorial-genesis` — локальная база V3, inbox и перестраиваемые индексы.
- `z-ai-glm-flowmusic-rag-ui-v2/anchoring` — сохранённый legacy-контур V2. Каталог намеренно остаётся в проекте: Python-мост V2 читает его артефакты, хотя его отдельный старый UI не компилируется вместе с основным приложением.

## Данные и индексы

Исходные батчи добавляются через **Combinatorial Genesis → Обработать inbox**. Невалидные элементы попадают в карантин с причинами. После изменения V3 необходимо перестроить те индексы, которые использует нужный режим:

1. composite retrieval / V3 live anchors;
2. CLAP text index для Audio CLAP RAG;
3. SigLIP2 text/value caches для Morpho-Acoustic RAG;
4. дополнительные relation/value anchors, если они включены в выбранном профиле.

Сгенерированные векторы, временные аудиофайлы, локальные БД, логи, модели и пользовательские датасеты исключены из Git. В репозитории остаются код, схемы, тесты и небольшие воспроизводимые метаданные.

## Audio-to-Parameter

Страница: `http://localhost:3000/audio-to-parameter-rag-segments`.

Режим загружает трек в WaveSurfer, показывает waveform, minimap и спектрограмму, затем создаёт временные узлы с заданным шагом. Каждый узел обрабатывается последовательно, чтобы не перегружать GPU. Поиск объединяет морфологические визуальные признаки спектрограммы и доступные retrieval-сигналы, после чего значения сглаживаются между соседними узлами. Во время воспроизведения активный узел, параметры и цветовые акценты синхронизируются с текущей позицией.

Поддерживаются остановка пакетной обработки, повторный запуск отдельных сегментов, разные представления спектрограммы, Vocal Allocation Matrix и экспорт Clean Macro/таймлайна. Точные правила приоритетов и сглаживания описаны в [отдельном документе](docs/audio-to-parameter.md).

## Проверки

```powershell
pnpm exec tsc --noEmit
pnpm exec eslint src
pnpm exec vitest run
python -m compileall -q python_engine
```

Тяжёлые retrieval-проверки запускайте последовательно: локальная конфигурация Ollama и мультимодальные модели могут совместно исчерпать VRAM. Перед CLAP/SigLIP2-поиском приложение освобождает загруженные Ollama-модели и выдерживает защитную паузу.

## Репозиторий

Проект использует `pnpm`; `node_modules` остаётся локальной виртуальной структурой со ссылками на общий store. Не добавляйте в Git содержимое `data`, `.next`, локальные модели, логи, временные спектрограммы и резервные копии. Перед удалением legacy-каталогов проверяйте обращения из `src` и `python_engine`: V2 anchoring остаётся рабочей зависимостью.
