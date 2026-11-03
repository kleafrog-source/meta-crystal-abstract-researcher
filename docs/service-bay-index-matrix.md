# Service Bay index matrix

This document records the on-disk artifact boundaries and the read-only status audit exposed in Service Bay. Refreshing the matrix reads manifests, catalogue snapshots and row metadata only; it does not load an embedding model or start a rebuild.

## Artifact paths and builders

| Bank / artifact | Encoder | Store | Builder / job |
|---|---|---|---|
| Composite text retrieval | Qwen3 `qwen3-embedding:0.6b` | `data/combinatorial-genesis/v3/composite-index/{manifest.json,rows.json,embeddings.f32}` | `python_engine/build-genesis-v3-composite-index.py`; Service Bay `composite` |
| Text retrieval | EmbeddingGemma 2 `embeddinggemma-2:740m` | `data/combinatorial-genesis/v3/embeddinggemma2-text-index/{manifest.json,rows.json,embeddings.f32}` | Same builder with `--output-dir` and `--retrieval-text-only`; job `embeddinggemma2_text` |
| Live axes / a_home | Qwen3 | `data/combinatorial-genesis/v3/anchoring/anchors_build.json` | `python_engine/anchoring_v3/build_anchors.py` with Qwen rows/vectors; job `anchors` |
| Live axes / a_home | EmbeddingGemma 2 | `data/combinatorial-genesis/v3/embeddinggemma2/anchors/anchors_build.json` | Same builder with Gemma rows/vectors; job `gemma2_anchors` |
| Range values | Qwen3 | `data/combinatorial-genesis/v3/value-anchors/{manifest.json,embeddings.f32}` | `python_engine/anchoring_v3/build_value_anchors.py`; job `range` |
| Select options | Qwen3 | `data/combinatorial-genesis/v3/value-anchors/{select-options.json,select-options.f32}` | Same builder; job `select` |
| Range values | EmbeddingGemma 2 | `data/combinatorial-genesis/v3/embeddinggemma2/range-anchors/{manifest.json,embeddings.f32}` | Same builder with Gemma `--composite-dir --output --direct`; job `gemma2_range` |
| Select options | EmbeddingGemma 2 | `data/combinatorial-genesis/v3/embeddinggemma2/range-anchors/{select-options.json,select-options.f32}` | Same builder; job `gemma2_select` |
| Relations | Qwen3 | `data/combinatorial-genesis/v3/relations/{manifest.json,embeddings.f32}` | `python_engine/anchoring_v3/build_relation_anchors.py`; job `relations` |
| Relations | EmbeddingGemma 2 | `data/combinatorial-genesis/v3/embeddinggemma2/relations/{manifest.json,embeddings.f32}` | Same builder with an isolated output; job `gemma2_relations` |
| Runtime atoms | Qwen3 | `data/combinatorial-genesis/indexes/<version_id>/{manifest.json,atoms.json,atom_embeddings.f32}` | `python_engine/build-combinatorial-runtime-index.py`; job `atoms` |
| Runtime atoms | EmbeddingGemma 2 | `data/combinatorial-genesis/v3/embeddinggemma2/runtime-atoms/{manifest.json,atoms.json,atom_embeddings.f32}` | Same builder with `--output-dir`; job `gemma2_atoms` |
| Audio candidates | CLAP | `data/combinatorial-genesis/audio-clap-index/index.json` and its vector/cache files | `python_engine/sidecar.py audio_index`; modality index is shared, not encoder-duplicated |
| Spectrogram/image candidates | SigLIP2 | `data/combinatorial-genesis/morpho-siglip/{manifest.json,rows.json,embeddings.f32}` | `python_engine/morpho_siglip.py build-index`; modality index is shared, not encoder-duplicated |

Qwen files retain their existing locations; Gemma jobs write only under `v3/embeddinggemma2/` or the already-existing Gemma text index. Neither encoder writes into the other encoder's vector files. The range builder's Gemma mode embeds full value texts directly, while Qwen retains its current factorized path.

## Expected counts and freshness

- Text/composite and live axes: current active catalogue snapshot parameter count.
- Range anchors: five vectors for every active `Range` parameter with numeric minimum and maximum.
- Select anchors: one vector for every active Select option.
- Relations: 12 relation vectors; expected parameter count is validated separately through the current source snapshot fingerprint and relation bindings.
- Runtime atoms: count of atoms in the latest frozen Genesis corpus after removing atoms whose non-empty source list becomes empty. This corpus is intentionally smaller than the live parameter catalogue; it is not expected to equal 6,968.
- CLAP: current active parameter snapshot count; its builder indexes one lexical text per eligible parameter.
- SigLIP2: the current eligible acoustic parameter count, using the canonical eligibility rules from `python_engine/morpho_siglip.py` (acoustic layers/scopes and non-acoustic namespace exclusions).

The status audit reports row count, expected count, built time, data fingerprint, and vector fingerprint. Data freshness uses the V3 snapshot hash when the manifest provides one, plus source count and version identity. Vector freshness checks encoder model and dimensions. Missing artifacts are `missing`; undersized artifacts are `partial`; changed source data is `stale_data`; changed model/dimension policy is `stale_vectors`; complete matching artifacts are `ready`. Legacy manifests without a source snapshot hash still receive count/version checks and show an unavailable data fingerprint.

## Banks

`text.qwen.resolved` uses Qwen composite plus Qwen live/range/select anchors. `text.gemma.awtd` and `audio.gemma.awtd` use the Gemma text parameter index and retain catalogue defaults. `text.gemma.resolved` and `audio.gemma.resolved` use Gemma-space anchors only when the corresponding Gemma artifact is ready; otherwise values fall back to defaults. `audio.clap.resolved` and `spec.siglip.resolved` use their single modality pipelines. `spec.gemma.*` is reported as partial/stub; it does not silently route SigLIP vectors through Gemma.

## Runtime atoms source

Both runtime atom jobs read the same files: `data/combinatorial-genesis/datasets/latest.json`, then that version's `manifest.json`, `atoms.json`, and `parameters.json`. The atom corpus is frozen Genesis content. Gemma builds re-embed those same atom texts into a separate Gemma directory; they do not derive the expected count from the full current catalogue.

## Exclusion migration and deletion

The exclusion registry is retired as a user-facing indexing control. Legacy live exclusions can be staged as `delete` operations from the catalogue queue. The operator then reviews and confirms the normal catalogue commit; it backs up the library, queue and legacy registry, writes catalogue tombstones, removes deleted names from the library, and purges missing-name registry orphans. Until the confirmed commit, the source parameters and registry remain intact. Tombstones prevent deleted frozen rows from reappearing in the merged retrieval snapshot. No index is rebuilt automatically; Refresh is read-only and rebuilds remain explicit per artifact.
