# AM-Stage · EmbeddingGemma multimodal query

## Shipped mode

AM-Stage has an experimental, collapsed-by-default **audio/spectrogram → parameters** query. It accepts either a short uncompressed PCM WAV (mono or stereo, 8–48 kHz, 0.25–30 seconds, at most 15 MiB) or the currently selected PNG frame already prepared for SigLIP2. The user starts either query explicitly; no dashboard or status poll loads a model.

The endpoint sends one modality per request as base64 in Ollama's multimodal `/api/embed` input object:

```json
{"model":"embeddinggemma-2:740m","input":{"audio":"<base64 WAV>"},"keep_alive":0}
```

The spectrogram path uses the same request with `image` instead of `audio`. It reuses the existing SigLIP2 preview frame and does not run SigLIP again. Audio and image requests both retrieve from the same Gemma text index; no modality-specific index is created.

The resulting 768-dimensional audio vector is compared with rows in the existing Gemma text-parameter index using cosine similarity and the shared Top-K, domain-first, and MMR path. No audio-parameter matrix is created. The index remains at `data/combinatorial-genesis/v3/embeddinggemma2-text-index/`; Qwen, CLAP, and SigLIP indexes are separate and unchanged. This is an experimental cross-modal retrieval path, not a replacement for CLAP or SigLIP2. It retrieves parameter identities; suggested values remain catalogue defaults.

No arbitrary image upload or video path is shipped in Stage 5. The image mode is limited to an existing SigLIP2 spectrogram frame. The model family supports broader image/video input, but this app flow does not add a video pipeline.

## Runtime and memory

The route acquires the app's single embedding-model slot, unloads other Ollama models, checks the installed Gemma model and current text-index status, performs the audio embedding with `keep_alive: 0`, searches the existing Gemma index, and releases the slot in `finally`. App-managed Qwen, CLAP, and SigLIP work cannot run concurrently through the shared slot. The lock is process-local; independent external Ollama clients are not coordinated.

Verified locally with Ollama `0.40.13` and `embeddinggemma-2:740m`: a 2-second PCM WAV and a 224×224 PNG each produced one 768D vector; the audio request returned a Top-10 result set from 6,549 scoped candidates. `ollama ps` was empty after the requests. This confirms request and retrieval flow, not ranking quality on representative music or real SigLIP spectrograms. The test used RX570 8GB / 16GB RAM; no GPU VRAM or throughput measurements were captured. Keep queries short and run them only after an explicit user action.

The full multimodal family and Ollama API support are documented at [EmbeddingGemma 2](https://ollama.com/library/embeddinggemma-2) and [Ollama embed request types](https://github.com/ollama/ollama/blob/main/api/types.go).
