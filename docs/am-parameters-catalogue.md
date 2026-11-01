# Каталог параметров AM

The published library at `data/combinatorial-genesis/library/parameters.json` is the sole live catalogue source for UI reads, edits, completeness, exports, deletes, and catalogue index inputs. Genesis dataset directories are historical archives and are not merged into the live catalogue; tombstones remain to preserve deletion history and protect other legacy consumers.

## Published schema and retrieval text

Published parameter records use the allowlist in `src/lib/combinatorial-genesis/parameter-schema.ts` and `python_engine/published_parameter_schema.py`: `technical_name`, `name_ru`, `description_en`, `description_ru`, `category`, `sub_category`, `ui_element`, type-appropriate numeric fields, `default`, `unit`, `quantity_kind`, `options`, `lyria_prompt_tags`, `semantic_keywords`, and `domain`. Range controls may use `min_value`, `max_value`, and `step`; Select controls may use `options`; inapplicable control fields are removed. Provenance such as `genesis`, `_collection`, `_semantic_group`, source paths, batch labels, package identifiers, parent lists, and selection scores is stored out of band under `library/provenance/provenance-index.json`.

Historical Genesis datasets remain untouched. Catalogue reads, runtime reads, composite-index datasets, and CLAP input sanitize records at their boundaries. The CLAP text builder's strict retrieval allowlist is `technical_name`, bilingual names/descriptions, category/subcategory, `ui_element`, `unit`, `quantity_kind`, tags, keywords, and domain; Select option labels are included. Defaults, numeric endpoints, provenance, and arbitrary unknown keys are excluded. Composite `retrieval_text` and `semantic_text` also use explicit lexical fields. A Python unit test documents the clean-record and embedding-text allowlists.

## Writes, queue, and indexes

Catalogue edits are staged in `library/catalogue-queue.json`. Confirmed commits create a timestamped backup in `library/history/`, replace the published library and manifest, update tombstones, mark indexes dirty, and finish queue items. Mutations never rebuild embeddings or indexes. Use `POST /api/am-parameters-catalogue/indexes/rebuild` with `{ "confirmed": true }` once, after all cleanup and fill work. The old status POST is disabled; status is read-only. The UI shows «Индексы требуют обновления» until this explicit final job succeeds.

The one-shot `POST /api/am-parameters-catalogue/schema/strip-provenance` scans the published library, snapshots out-of-band fields, and leaves historical datasets untouched. Future catalogue queue commits and Genesis publish/freeze writers apply the same canonical field allowlist.

## Completeness pipeline

`docs/prompts/FLOWMUSIC_COLLECTION_PROMPT_V1.md` defines the type-aware completeness rules. Every type requires `technical_name` (snake_case), `name_ru`, bounded EN/RU descriptions, canonical category and subcategory, `ui_element`, type-valid `default`, `unit`, snake_case `quantity_kind`, three English tags, seven keywords (3 Russian then 4 English), and a closed-set domain. Range, Select, Toggle, Text, String, and Array controls each have their protocol-specific value shape.

`GET /api/am-parameters-catalogue/completeness` returns completeness for the published library, per-field gaps, and sorted incomplete rows. The **Полнота** tab filters by type/category/missing field, supports multi-select and select-all-filtered, and fills batches of 10 by default using FreeLLMAPI (default) or Ollama. The batch size is saved in browser local storage. **Стоп** finishes the current HTTP batch and prevents the next batch from starting; successful commits remain published. The builder sees only sanitized lexical/control context and may fill only listed missing/invalid fields. Patches are type-checked and applied only when they improve completeness; valid values are preserved. Failed provider/JSON/patch attempts enter `completeness/retry-queue.json`, with up to three attempts before `failed_permanent`.

The **Тип** column in the main table is bound to `ui_element` and can be filtered and sorted. Gaps and completeness tables show the same type-aware score. Normalization, deletion, schema stripping, imports, and LLM fills all leave indexes dirty without starting an embedding job.
