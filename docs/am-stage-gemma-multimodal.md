# AM-Stage · EmbeddingGemma multimodal query

## Shipped mode

AM-Stage has an experimental, collapsed-by-default **audio/spectrogram → parameters** query. Audio accepts any source format supported by the existing CLAP decoder (up to 150 MiB), converts it into mono 48 kHz PCM-16 WAV, and searches sequential windows of at most 30 seconds. A spectrogram query uses the currently selected PNG frame already prepared for SigLIP2. The user starts either query explicitly; no dashboard or status poll loads a model.

The endpoint sends one modality per request as base64 in Ollama's multimodal `/api/embed` input object. Audio requests are made one chunk at a time while the explicit job holds the single-model slot; each embed keeps Gemma warm for the queue, then the route unloads it on completion, failure, or cancellation.

The spectrogram path uses the same request with `image` instead of `audio`. It reuses the existing SigLIP2 preview frame and does not run SigLIP again. Audio and image requests both retrieve from the same Gemma text index; no modality-specific index is created.

The resulting 768-dimensional audio vector is compared with rows in the existing Gemma text-parameter index using cosine similarity and the shared Top-K, domain-first, and MMR path. No audio-parameter matrix is created. The index remains at `data/combinatorial-genesis/v3/embeddinggemma2-text-index/`; Qwen, CLAP, and SigLIP indexes are separate and unchanged. This is an experimental cross-modal retrieval path, not a replacement for CLAP or SigLIP2. It retrieves parameter identities; suggested values remain catalogue defaults.

No arbitrary image upload or video path is shipped in Stage 5. The image mode is limited to an existing SigLIP2 spectrogram frame. The model family supports broader image/video input, but this app flow does not add a video pipeline.

## Runtime and memory

The route acquires the app's single embedding-model slot, unloads other Ollama models, checks the installed Gemma model and current text-index status, embeds audio chunks sequentially with Gemma warm for the queue, searches the existing Gemma index, then explicitly unloads Gemma and releases the slot in `finally`. App-managed Qwen, CLAP, and SigLIP work cannot run concurrently through the shared slot. The lock is process-local; independent external Ollama clients are not coordinated.

Verified locally with Ollama `0.40.13` and `embeddinggemma-2:740m`: a 2-second PCM WAV and a 224×224 PNG each produced one 768D vector; the audio request returned a Top-10 result set from 6,549 scoped candidates. `ollama ps` was empty after the requests. This confirms request and retrieval flow, not ranking quality on representative music or real SigLIP spectrograms. The test used RX570 8GB / 16GB RAM; no GPU VRAM or throughput measurements were captured. Keep queries short and run them only after an explicit user action.

The full multimodal family and Ollama API support are documented at [EmbeddingGemma 2](https://ollama.com/library/embeddinggemma-2) and [Ollama embed request types](https://github.com/ollama/ollama/blob/main/api/types.go).

## Full-track audio gate (AM-Stage UI shell)

Audio uploads now use the existing CLAP audio pipeline to inspect and crop the source into mono, 48 kHz, PCM-16 WAV windows. The uploaded source may be any format decodable by that pipeline, up to 150 MiB. The UI defaults to 30-second chunks, accepts 1–30 seconds per chunk and 0–2 seconds of overlap, and displays live `chunk i/N` progress with an explicit Cancel action. Only one chunk is embedded and searched at a time. Each request remains at or below the model's 30-second limit.

Chunk results are merged by `technical_name`, keeping the result with the highest cosine similarity for each parameter; the final list is then sorted by similarity and cut to the selected Top-K. Audio embeddings keep Gemma alive only while the explicit job is running; the route sends an unload request when the job completes, fails, or is cancelled. The single-model slot remains held for the full chunk queue. Image input is unchanged: it uses the current SigLIP spectrogram PNG frame directly and is not chunked. No whole-track PNG or video conversion is performed.

The Work Axis uses the same CLAP crop/conversion helper, WaveSurfer's adaptive timeline ticks, a synchronized playhead/duration readout, and a draggable region for the analysis gate. Numeric bounds remain available as a secondary control; Full file and Use waveform selection apply the gate with one click. Changing the gate marks the existing node list stale and requires Auto-split before another CLAP/SigLIP run. Node seek moves the playhead without silently changing the gate. The Axis is a resizable panel above the scrollable workspace; its pin toggle switches between a viewport-height split and ordinary document scrolling. Wide layouts use two work columns rather than four compressed columns.

The Layer Matrix uses full layer color for active layers and desaturated/muted styling when inactive. All 9 and Clear expose their pressed state and the active layer count.
