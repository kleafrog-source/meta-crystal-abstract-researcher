# MMSS mode documents

These documents describe the visible AM-Core modes and the current AM-Stage contracts. They are reference artifacts, not runtime configuration or a source of catalogue/index data.

- [`abstract-mindfreak-modes-catalog.mmss.json`](abstract-mindfreak-modes-catalog.mmss.json) — primary sidebar modes, direct navigation targets, legacy group, model slots, banks and shared boundaries.
- [`am-tri-modal-stage.mmss.json`](am-tri-modal-stage.mmss.json) — the four Stage zones, modality banks, layer mask and indexing boundary.
- [Mode cards in English and Russian](../modes/).

## Method and provenance

The route and feature inventory was checked against `src/components/layout/Sidebar.tsx`, `AppShell.tsx`, `PageRenderer.tsx`, the page components, `src/lib/capability-registry.ts`, `src/lib/am-stage-macros.ts`, `src/lib/domain-layers.ts`, and the Catalogue/Service Bay implementations. The distinction between catalogue authority, index maintenance and session workbench follows the operator’s product intent and is checked against those implementations.

Statements that are configurable or conditional are labeled as such. These files do not assert runtime model availability, data counts, retrieval quality or automatic index freshness.

## По-русски

Эти документы описывают видимые режимы AM-Core и текущий контракт AM-Stage. Это справочные артефакты, а не runtime-конфигурация и не источник данных каталога/индексов.

- [`abstract-mindfreak-modes-catalog.mmss.json`](abstract-mindfreak-modes-catalog.mmss.json) — основные режимы сайдбара, маршруты, legacy-группа, слоты моделей, банки и общие границы.
- [`am-tri-modal-stage.mmss.json`](am-tri-modal-stage.mmss.json) — четыре зоны Stage, банки модальностей, маска слоёв и граница управления индексами.
- [Карточки режимов на английском и русском](../modes/).

Сверка выполнена по указанным выше компонентам и библиотекам. Условные возможности помечены; документы не утверждают, что модели установлены, индексы готовы или качество поиска проверено.
