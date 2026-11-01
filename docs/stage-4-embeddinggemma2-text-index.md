# Stage 4 — EmbeddingGemma 2 parallel text index

The default remains the existing `qwen3-embedding:0.6b` index at `data/combinatorial-genesis/v3/composite-index/`. Stage 4 adds an isolated `embeddinggemma-2:740m` text index at `data/combinatorial-genesis/v3/embeddinggemma2-text-index/`. Their vectors are model-specific and must never be mixed.

EmbeddingGemma 2 `:740m` is the full multimodal model. Ollama describes its shared 768-dimensional space for text, images, video, and audio. This Stage 4 path indexes the published parameter text only; later modality work can use the same model family and vector space. Source: [Ollama EmbeddingGemma 2 model page](https://ollama.com/library/embeddinggemma-2).

## Build and status

Use AM-Core Engine → Service Bay → **Build EmbeddingGemma 2 text index**. The managed job reports progress and logs and supports cancellation. It reserves the app's embedding model slot and unloads other Ollama models before starting. App-managed Qwen, CLAP, and SigLIP2 index jobs and searches are rejected while this slot is held.

The equivalent command is:

```powershell
python python_engine/build-genesis-v3-composite-index.py `
  --model embeddinggemma-2:740m `
  --endpoint http://localhost:11434 `
  --batch-size 16 `
  --output-dir data/combinatorial-genesis/v3/embeddinggemma2-text-index `
  --retrieval-text-only
```

The build uses the same retrieval text payload and field allowlist as the Qwen composite index. It does not rewrite Qwen's shared `dataset.json` or reuse semantic-cache vectors with a different text policy. The output contains `manifest.json`, `rows.json`, and `embeddings.f32`; the status response includes model, dimensions, indexed row count, fingerprint, and stale reasons against the current library snapshot.

## Retrieval and storage

Semantic Search in AM-Core Engine and AM-Stage has a persisted selector. Qwen3 remains the default. A selected Gemma search requires the Gemma index to exist; it does not fall back to Qwen. Existing Top-K, domain-first selection, and MMR post-processing are shared. Gemma searches only load Gemma for embedding and skip Qwen-only atom, relation, option-vector, and anchoring artifacts until parallel versions exist; discrete values fall back to current/default values.

At 6,552 rows and 768 float32 dimensions, the raw Gemma matrix is about 19.2 MiB, plus JSON rows and manifest. The model itself is about 1.3 GB in the Ollama library. Ollama chooses CPU/GPU placement; this build does not force a GPU. The actual runtime, throughput, and VRAM use have not been measured here.

The lock coordinates app-managed operations in this Next.js server process. Independent Ollama clients or commands outside the app are not controlled by that in-process lock and should be stopped during a build.
