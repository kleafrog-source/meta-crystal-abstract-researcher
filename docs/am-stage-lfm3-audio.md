# AM-Stage LFM3-Audio

LFM3 adds an explicit audio-to-text action for the active AM-Stage segment (or
the selected waveform range when no analysis segments exist). It is independent
of CLAP/SigLIP retrieval and does not create parameter embeddings.

## Runtime and Windows setup

The default runtime is **Ollama · verified local** on the stock local service at
`http://127.0.0.1:11434`. This machine's audio path was verified with stock
Ollama `0.40.13`, `lfm3-audio:latest` (Q4_K_M), and `tasks/new/part3.wav`.
The optional alternate runtime is **llama.cpp** with a prebuilt Windows binary and the
official GGUF repository [LiquidAI/LFM3-Audio-2B-GGUF](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF).
Install a current Windows release from the [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases)
that includes multimodal/audio support, or use the model card's Windows
installation command `winget install llama.cpp`. Do not build Ollama from
source. Current installs may expose `llama.exe` with the `cli` subcommand;
older release bundles may expose `llama-cli.exe`. The bridge tries both. Set
`AM_STAGE_LFM3_LLAMA_CLI` to an explicit executable path when neither is on
`PATH`.

On the first explicit run, llama.cpp downloads the selected model and audio
projector using the model card's `-hf` mechanism. The default spec is
`LiquidAI/LFM3-Audio-2B-GGUF:Q4_K_M`. Override it with
`AM_STAGE_LFM3_GGUF_MODEL`. Optional `AM_STAGE_LFM3_GPU_LAYERS` defaults to `0`
(CPU-safe); set it to `99` with a Vulkan-enabled Windows release to offload as
many layers as possible to the RX570. The model card requires llama.cpp
b11960 / v0.8.0 or newer, lists Q4_K_M, and documents
the `--audio`, `-sys`, and `-p "<__media__>"` CLI invocation. See the official
[LFM3 GGUF instructions](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF#use-with-llamacpp)
and [llama.cpp multimodal guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md).

The **Ollama** runtime is supported only after checking for an installed
model advertising the `audio` capability. This Windows machine was verified
with stock Ollama `0.40.13`, `lfm3-audio:latest` (Q4_K_M), and
`tasks/new/part3.wav`. Its working chat path passes the prepared WAV through
the Ollama `images` field; the native chat request's `audio` field is not a
portable/documented input contract. The app defaults the UI to Ollama and keeps
llama.cpp selectable; its Ollama URL defaults to
`http://127.0.0.1:11434`. Optional overrides:

- `AM_STAGE_LFM3_OLLAMA_BASE_URL` (loopback HTTP only)
- `AM_STAGE_LFM3_OLLAMA_MODEL` (default `lfm3-audio:latest`)

The Windows smoke test took about **14.1 seconds total** on this machine,
including **10.3 seconds model load**; the response used 33 generated tokens.
The model was unloaded after the request (`keep_alive: 0`, empty `ollama ps`).
Latency depends on the selected window, runtime, and GPU offload. Ollama's
published model card currently documents audio input on macOS; its Windows
capability is treated as machine-specific and must be verified, not assumed.
See the [model card](https://huggingface.co/LiquidAI/LFM3-Audio-2B-GGUF) and
[Ollama API compatibility issue](https://github.com/ollama/ollama/issues/19378)
for the input-field caveat.

## App behavior

- Manual button only; there is no startup/status model load.
- One selected window from 0.25 to 30 seconds is prepared as mono 16 kHz PCM WAV.
- Prompt modes are fixed and English-only: concise sound description (maximum
  800 requested characters) or `Perform ASR in English.` Outputs are capped at
  1,200 characters.
- The shared model slot is acquired, existing stock Ollama models are unloaded
  before inference, and the selected model is released after the request.
- The result is a draft until **Keep on segment** is selected. Accepted text is
  stored in that segment's `sideMeta.lfm3_description` and therefore included
  in saved AM-Stage session snapshots. The operator can also copy the text to
  Brief, use it as a V3/Reverse Query seed, or save it in Journal with the audio
  window and current parameter snapshot.
- Missing llama.cpp, unavailable runtime, missing model, or unsupported audio
  input returns an actionable UI error. The clip preparer currently accepts
  WAV/FLAC inputs that `soundfile` can decode.

## Relation to Whisper and resource notes

Whisper mic-to-text remains unchanged. It is still used for speech entry into
query fields; LFM3 handles a selected media clip and can describe music as well
as transcribe speech. This is not a replacement for CLAP/SigLIP embeddings,
Semantic Search, or audio-to-parameter retrieval.

Q4_K_M is the selected 2B-class quant for an 8 GB RX570 / 16 GB system. CPU is
the conservative default; Vulkan offload can be enabled with the prebuilt
binary and `AM_STAGE_LFM3_GPU_LAYERS=99`. Only one model job is admitted at a
time and LFM3 is not loaded while idle. No weights or llama.cpp binaries are
vendored in the repository.
