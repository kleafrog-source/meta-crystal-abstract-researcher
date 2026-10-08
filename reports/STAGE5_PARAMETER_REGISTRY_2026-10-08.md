# Stage 5 — Parameter Registry

Дата: 2026-10-08

## Реализация

- Tombstone-реестр: `data/combinatorial-genesis/registry/excluded.json`.
- Ключ записи: уникальный `technical_name`.
- Provenance: `excluded_at`, `excluded_by`, `reason`, `scope`.
- Запись выполняется атомарно через временный файл и rename.
- Исходные `library/parameters.json` и `v3/dataset.json` не редактируются.
- API поддерживает чтение, пакетное исключение и пакетное восстановление.
- UI содержит поиск, фильтр active/excluded, чекбоксы, пакетные операции и причину исключения.
- Control bank содержит раздельные действия «Убрать из панели» и «Исключить из базы».

## Build-time filtering

Единый Python-модуль `parameter_registry.py` подключён к:

1. Qwen composite index;
2. runtime atom index;
3. live axes / `a_home`;
4. Range value anchors;
5. Select option anchors;
6. relation anchors;
7. CLAP text index.

Фильтрация выполняется во время build. Runtime top-k не скрывает tombstone искусственно: до перестройки соответствующий индекс честно имеет статус `stale`.

## Фактическая проверка

Пользователь исключил через UI четыре параметра:

- `auto_recursion_phase_adjacent_error_diffusion`;
- `error_recovery_retry_attempts_max`;
- `omega_synthesis_quantum_error_correction_fidelity_min`;
- `omega_synthesis_recursive_closure_x7_to_d0_seamlessness`.

После перестройки Qwen composite:

- registry entries: 4;
- composite `excluded_count`: 4;
- утечки в `v3/composite-index/rows.json`: 0;
- все четыре записи по-прежнему находятся в `v3/dataset.json`;
- все четыре записи по-прежнему находятся в `library/parameters.json`.

Unit-тест runtime atoms подтверждает:

- atom только с исключённым источником удаляется;
- у общего atom исключённый источник удаляется из `source_parameters`;
- активный источник сохраняется.

## Состояние производных индексов

Текущий registry SHA-256: `c2cf1f7c9f40d071bc4ba43b33d6e38bf3f4b585abe5e871273acb84c99ef121`.

- Qwen composite: registry SHA совпадает;
- live anchors: registry SHA совпадает;
- CLAP: registry SHA совпадает;
- Range/Select anchors: старая модель и отсутствует registry SHA — stale;
- relations: старая модель и отсутствует registry SHA — stale.

## Критерии приёмки

- [x] `excluded.json` создан, схема зафиксирована.
- [x] «Исключить» / «Вернуть» доступны из UI.
- [x] Control bank предоставляет «Исключить из базы».
- [x] Изменение registry помечает несовпадающие индексы stale.
- [x] После composite rebuild исключённые параметры физически отсутствуют.
- [x] Dataset/library сохраняют provenance-источник.
- [x] Все builders используют единый build-time filter.
- [x] Дубликаты `technical_name` запрещены структурой Map.

Полный десятизапросный registry-leak аудит отложен до согласования размерностей всех Qwen-артефактов на Stage 6: текущие Range/Select/relations ещё имеют размерность старой модели.
