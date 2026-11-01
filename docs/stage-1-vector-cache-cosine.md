# Stage 1 — vector cache and cosine ranking

## What is cached

- Ollama text embeddings: data/combinatorial-genesis/v3/query-embedding-cache/. The SHA-256 key includes cache format version, provider, normalized endpoint, model id, and the exact trimmed input. A bounded 256-entry process LRU and disk cache serve both single and batch requests; batch inference receives only unique misses.
- CLAP audio-segment embeddings: data/combinatorial-genesis/audio-clap-index/query-vector-cache/. The key includes model/device, audio file SHA-256, segment offset and duration, resampling/channel settings, chunk sizes, and a preprocessing version. A hit skips audio decode and CLAP model loading/inference.
- CLAP ranking sidecar: data/combinatorial-genesis/audio-clap-index/search-cache/. A compact row file and contiguous float32 matrix are derived from the compatible index.json; a small status.json fingerprints the catalogue source. This avoids reparsing the full vector-bearing JSON on subsequent searches. If the catalogue fingerprint changes or a sidecar is missing/corrupt, the existing index JSON remains the source of truth and the sidecar is rebuilt from it without model inference.
- SigLIP image/frame embeddings: data/combinatorial-genesis/morpho-siglip-row-cache/image-query-vectors/. Keys include the fixed model id/revision, exact image bytes, processor/preprocessing version. A hit skips image inference and model loading. Value-anchor embeddings remain in their existing versioned cache; SigLIP is loaded for those only when at least one requested text anchor misses.

All writes use temporary files and atomic replacement. Invalid or truncated vectors are cache misses. Deleting any cache directory is safe: published catalogue/index JSON and existing SigLIP index files remain unchanged, and caches are regenerated lazily. No library corpus or model is rebuilt by cache reads.

## Ranking semantics

CLAP stores unit-normalized text/audio vectors and now scores the contiguous matrix with matrix @ query. SigLIP already stores unit-normalized index vectors and uses vectors @ query; the query frame is normalized before scoring. Composite text retrieval also normalizes the query and uses dot products against normalized vectors. These are cosine scores up to float32 rounding. CLAP keeps original row order as the score tie-breaker; the other ranking paths retain their existing argsort/name tie handling.

The Stage 1 fixture compares row-by-row cosine dot products with one matrix multiply for a fixed seeded 6,552 × 512 corpus. On the fixed local run, row-wise scoring took 0.012522 s and matrix scoring took 0.000899 s (13.93×); maximum score error was 3.73e-8, and the full score order matched exactly. The primary repeated-work reduction is that cache hits do zero model inference; CLAP additionally avoids loading/parsing its approximately 80 MB legacy JSON embedding payload on subsequent searches.

## Verification

Commands run from repository root:

    python -m unittest python_engine.test_stage1_vector_cache
    python -m py_compile python_engine/vector_cache.py python_engine/audio_clap_rag.py python_engine/morpho_siglip.py
    pnpm exec tsc --noEmit --pretty false
