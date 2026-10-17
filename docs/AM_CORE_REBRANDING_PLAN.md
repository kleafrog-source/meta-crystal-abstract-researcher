# План совместимого ребрендинга AM-Core

## Уже изменено

- Пользовательское имя Flowmusic Genesis V3 заменено на **AM-Core Engine**.
- Vocal Allocation Matrix отображается как **AM-Vocal Morphology Matrix**.
- Главная оболочка обозначена как **Abstract-Mindfreak / AM-Core**.
- Добавлены канонические маршруты `/am-core` и `/am-vocal-morphology-matrix`.
- Старые маршруты `/rag-parameters-v3` и `/vocal-allocation-matrix` сохранены и продолжают работать.

## Совместимость, которую следует сохранять

- `/api/rag-v3/*` — публичный внутренний API рабочего retrieval; переименование не даёт функциональной пользы и сломает существующих клиентов.
- `/api/mmss/*` и команды `mmss_*` — legacy runtime IRE. В интерфейсе используется IRE, а технические идентификаторы сохраняются до решения об удалении модуля.
- `data/combinatorial-genesis/*` — существующее версионированное хранилище и manifests.
- Поля provenance, в которых Flowmusic обозначает источник данных, не переименовываются: это фактическое происхождение записей, а не бренд интерфейса.

## Безопасная последующая миграция

| Текущее имя | Целевое имя | Действие |
|---|---|---|
| `RagParametersV3Page` | `AMCoreEnginePage` | Добавить новый экспорт, оставить старый alias на один релиз. |
| `src/lib/rag-v3` | `src/lib/am-core` | Не перемещать до стабилизации UI; затем сделать один механический commit с обновлением импортов. |
| `/api/rag-v3/*` | `/api/am-core/*` | Только alias-маршруты; старые endpoint не удалять. |
| `VocalAllocationMatrixPage` | `AMVocalMorphologyMatrixPage` | Новый экспорт с совместимым alias. |
| `MMSS` component | `IRE` | UI уже переименован; файл и API остаются legacy-compatible. |

Переименование source/provenance-терминов Flowmusic не планируется: оно исказило бы историю собранного корпуса.
