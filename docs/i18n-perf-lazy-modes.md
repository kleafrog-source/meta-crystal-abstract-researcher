# i18n, model-status, and route-loading notes

## Model loading and status checks

Model startup is reserved for explicit user actions such as Search, Analyze, Build index, and Rank embeddings. Status probes must not send inference requests or otherwise warm model weights.

`GET /api/morpho/status` reads the SigLIP index manifest, in-memory job state, and the source snapshot identity. It does not spawn Python or load SigLIP2. The snapshot digest is reused while the `latest.json`, library parameters, frozen parameters, and exclusion registry file metadata remain unchanged; changed files trigger a digest refresh. AM-Stage, Audio-to-Parameter, and Morpho-Acoustic make one cold metadata request when mounted. They start a 1.2–2 second interval only after the response reports an active related job; the interval stops when the job ends and pauses while the browser tab is hidden. The Dashboard makes one request to `/api/rag-v3/status` on mount and has a manual refresh action, with no idle timer. Other index/rebuild panels poll only while their job state is running.

The old `probeOllama()` implementation sent the text `probe` to the embeddings API. `/api/rag-v3/status` calls that probe, so simply opening the dashboard could load the configured embedding model. It now uses Ollama `/api/tags`, which lists installed models without invoking inference. A dashboard status request therefore no longer warms `qwen3-embedding:0.6b`.

The current GPU memory coordination is explicit-action based: audio CLAP, Morpho/SigLIP2, and Audio-to-Parameter routes call `prepareGpuForExternalModel()` before external model inference, which unloads resident Ollama models; V3 embedding routes call `prepareGpuForV3Embedding()`, which keeps the configured embedding model and unloads other Ollama models. The managed rebuild report records that the Qwen rebuild unloads the model after completion (`reports/STAGE6_MANAGED_REBUILD_2026-10-08.md`). The code does not provide a global mutex across independent requests, so this is a memory-preparation policy rather than a guarantee that concurrent user-triggered model jobs are serialized.

The status-triggered load/unload cycle was possible because the embedding probe could load Qwen and a later explicit external-model action could unload it. `/api/morpho/status` itself did not load any model; its repeated cost came from recalculating a large source snapshot digest. The status path now caches that digest against source-file metadata, and idle polling has been removed.

## Lazy heavy modes

`White Space Discovery`, `Knowledge Graph`, and `Cross-Modal Consensus` are loaded through `next/dynamic` in `src/components/layout/PageRenderer.tsx`. They are not in the session-preservation set, so the renderer mounts the selected mode only after navigation and unmounts it when leaving. No dashboard or shell-level import invokes their data loaders. This retains the existing route-level split and keeps these modes out of the initial dashboard/AM-Stage render path.

## AM-Stage English copy

The root layout reads `am_locale` on the server and renders the selected language before hydration. Settings persist the selection in that cookie and refresh the router. The Brief panel retains its title-level help hint and no longer repeats the same interpolation/submit hint inside the panel body. The save-session, Brief, Semantic Search mode/source, crystal picker, Top-K, instruction settings, and continue-run hints/actions use the UI locale dictionary. German continues to use the English fallback.
