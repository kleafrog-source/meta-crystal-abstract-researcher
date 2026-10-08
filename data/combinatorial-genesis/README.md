# Flowmusic collection folders

## Обычный сценарий

1. Скопировать новые полные экспорты Flowmusic или других LLM `.txt`/`.md` в `flowmusic-inbox/`.
   Уже обработанные исходные чаты хранить в `flowmusic-inbox-backup-archive/`: pipeline читает их как
   постоянную историю corpus, сохраняя provenance и frequency, но переиспользует готовые embeddings.
2. Нажать **«Обработать inbox»** на странице `/combinatorial-genesis`. Кнопка последовательно выполняет
   сбор, quality gate + semantic triage, freeze, runtime-индекс и persistent composite index V3.
   **«Остановить»** завершает текущее дерево процесса, а **«Перезапустить»** безопасно заменяет текущий запуск.

Эквивалентная команда из корня проекта:

```powershell
python python_engine/run-combinatorial-pipeline.py
```

3. Результаты появятся в `flowmusic-output/`:

- `flowmusic_batches.json` — batches, raw JSON, ошибки и provenance;
- `flowmusic_occurrences.json` — появления из валидных batches без потери дублей;
- `flowmusic_rejected_occurrences.json` — отдельный карантин только невалидных параметров с `validation_errors`;
- `unified_parameters_lexical.json` — exact-name canonical records с `_collection` metadata;
- `collection_report.json` — итоговая статистика.
- `normalization_report.json` — предложения по aliases и lexical near-duplicates без изменения исходных данных.

## Обработка отдельного файла

```powershell
python python_engine/collect-json-from-folder.py "путь-к-файлу.txt"
```

Можно передать несколько файлов и/или папок. Старые результаты в `flowmusic-output/` полностью пересобираются из переданных входов; поле `generated_at` отражает время запуска.

Exact-name dedup не удаляет происхождение: все occurrences и sources сохраняются. Semantic dedup и нормализация units/categories выполняются отдельным следующим этапом.
Размер batch не ограничен десятью параметрами. В частично невалидном batch валидные параметры участвуют
в canonical dataset, а только ошибочные параметры попадают в quarantine. Причины доступны в
`collection_report.json`, `flowmusic_batches.json` и в UI-блоке **«Причины карантина»**.
Если `technical_name` можно безопасно привести к English snake_case, collector делает это автоматически
и записывает исходное и итоговое имя в provenance: переводит регистр (`gain_dB` → `gain_db`), заменяет
дефисы подчёркиваниями и отдельно сохраняет L-system как цельный токен (`l-system` → `lsystem`). Такие
исправленные параметры не попадают в **«Причины карантина»**. Кириллица, пробелы и другие неоднозначные
случаи автоматически не транслитерируются.

## Подготовка корпуса и bge-review

После сборщика запустить:

```powershell
python python_engine/prepare-combinatorial-corpus.py
```

Новые результаты:

- `eligible_parameters.json` — quality-gated рабочий срез без изменения canonical/raw;
- `quality_report.json` — объяснимые причины карантина и ручной проверки;
- `atom_corpus.json` — английские атомы, частоты и параметры-источники;
- `semantic_review_queue.json` — ближайшие bge-m3 пары только для review;
- `semantic_report.json` — модель, метод и распределение score;
- `semantic_auto_triage.json` — автоматические `same/related/distinct`, confidence и причины;
- `semantic_groups.json` — группы консервативно признанных эквивалентов;
- `unified_parameters_semantic_draft.json` — отдельный semantic-deduplicated draft;
- `semantic_embeddings.f32` + metadata — локальный cache эмбеддингов.

bge-score ничего не объединяет автоматически: решения `same/related/distinct` остаются отдельным этапом.

Классификация `same/related/distinct` выполняется автоматически. На странице `/combinatorial-genesis`
её можно переопределить вручную, но это не является обязательным этапом. Overrides сохраняются отдельно
в `data/combinatorial-genesis/reviews/semantic_decisions.json` и не изменяют Flowmusic Genesis V2.

## Immutable dataset version

После подготовки корпуса версию можно зафиксировать командой:

```powershell
python python_engine/freeze-combinatorial-dataset.py
```

Версия получает content-addressed ID: повторный запуск с теми же данными переиспользует ту же папку.
`datasets/latest.json` указывает на текущую experimental-версию. Внутри находятся `parameters.json`,
`atoms.json`, `semantic_groups.json` и manifest с SHA-256. Временные метки и локальный Ollama endpoint
не влияют на ID версии.

## Runtime atom index

Embedding model и Ollama endpoint берутся из общего раздела приложения **«Настройки»**. После смены
модели runtime/composite index и live anchors нужно перестроить: векторы разных моделей не смешиваются.

Для отладки отдельного этапа новой frozen-версии можно построить локальный bge-m3 индекс атомов:

```powershell
python python_engine/build-combinatorial-runtime-index.py
```

Индекс сохраняется отдельно в `indexes/<version-id>/`, не изменяет frozen dataset и повторно
используется при неизменных version/model/embedding text. Runtime preview ранжирует атомы по запросу,
генерирует bounded candidates, применяет exact stop-list автономной library + frozen dataset и повторно сортирует
целые имена кандидатов через bge-m3.

## Value inference и experimental packages

Отдельная страница `/combinatorial-synthesis` проводит весь BGE-only workflow: выбор исходных
technical_name, детерминированную комбинацию frozen atoms, BGE rerank, ручной отбор, сохранение draft,
dry-run и публикацию готовых параметров в автономную CG library. LLM в этом процессе не вызывается.
В каждой карточке кандидата блок **«Проверить control values и metadata»** позволяет исправить
`needs_review`, выбрать UI element, задать диапазон/options/default и проверить полный metadata-контракт:
`name_ru`, `description_en`, `description_ru`, `category`, `sub_category`, три `lyria_prompt_tags` и семь
`semantic_keywords`. До явного подтверждения review кандидат нельзя включить в публикуемый пакет.

Кнопка **«Нормализовать описания»** запускает отдельный post-process через chat-модель из общих
**«Настроек»**. Генерация technical_name и BGE ranking остаются без LLM. Chat-модель читает неизменяемую
control schema, tags, keywords и полные metadata параметров-источников, но может вернуть только
`name_ru`, `description_en`, `description_ru` и рекомендацию отбора. Перед запуском полный snapshot
кандидатов и donor metadata сохраняется в `normalization-jobs/`, а ответы дописываются туда после каждого
результата. Для компактной `hermes3:3b` запросы отправляются по одному кандидату, а модель удерживается в Ollama
через `keep_alive`, поэтому между запросами она не перезагружается. Процесс можно остановить из UI. Ответы проходят
JSON/schema/placeholder validation, а слишком длинный текст безопасно сокращается по границе предложения или слова.
При ошибке ответ автоматически запрашивается повторно. В UI исходные donor-derived тексты и редактируемые LLM-тексты
показываются рядом разными цветами. **«Применить LLM-отбор»** переносит нормализованные поля и отмечает
только рекомендованные кандидаты с уже валидной control schema.

Runtime preview выводит `quantity_kind`, `ui_element`, `unit`, диапазон, default и step только из
совместимых parent donors. Доноры дополнительно ранжируются bge относительно полного candidate name.
Если несколько источников не согласуются, кандидат остаётся `needs_review`; выдуманный диапазон ему не
назначается.

Кнопка `Save experimental package` создаёт content-addressed draft в `drafts/`. Повторное сохранение
того же результата переиспользует package ID. Проверка публикации экспортирует только `auto_resolved`
кандидаты в `exports/<package-id>/` и вычисляет simulated diff/hash. Публикация добавляет их в
`library/parameters.json`, сохраняет резервную копию в `library/history/` и идемпотентна по package ID.

## Автономная библиотека

`reference/base_parameters.json` — неизменяемый стартовый снимок 2733 параметров V2. При первом запуске
он копируется в локальную `library/parameters.json`. После этого preview, stop-list, value donors и
публикация используют только собственную library; файлы Flowmusic Genesis V2 не читаются и не изменяются.
На странице имя `FLOWMUSIC_COLLECTION_PROMPT_V1.md` открывает окно с полным актуальным текстом промта.
Канонические `library/parameters.json` и `library/manifest.json` не игнорируются Git, поэтому принятые
результаты можно переносить вместе с проектом. Runtime indexes, exports и history-backups остаются локальными.
