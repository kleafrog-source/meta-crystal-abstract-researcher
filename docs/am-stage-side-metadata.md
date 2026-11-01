# AM-Stage segment side metadata

Stage 6 adds explicit, per-segment specialist actions in AM-Stage. Opening the page, polling status, creating segments, restoring a session, and running CLAP/SigLIP do not invoke these specialists. Each action takes one segment window and writes its result into that segment's optional `sideMeta` field. Existing `am_stage_session_v1` snapshots persist it through `timeline.segments`; older snapshots remain valid because the field is optional.

## Contract

The shared TypeScript/Python payload is defined by [`schemas/segment-side-meta-v1.schema.json`](schemas/segment-side-meta-v1.schema.json) and [`src/lib/segment-side-meta.ts`](../src/lib/segment-side-meta.ts). `SegmentSideMeta` contains:

- `helm.gates`: `has_vocals`, `has_speech`, `aggressive_vocal`, `is_ambient_noise`; each includes a boolean-or-null answer, probability for `true` and `false`, and confidence when the runtime supplies it.
- `gender`: `male | female | unknown`, score, both class probabilities, model ID, and `acoustic_voice_presentation` semantics. This estimates acoustic presentation; it does not identify a person's gender.
- `language`: up to three ranked Vakgyata language tags with confidence, model ID, and top confidence. Supported tags are `en-IN`, `hi-IN`, `or-IN`, `bn-IN`, `ta-IN`, `te-IN`, `kn-IN`, `ml-IN`, `mr-IN`, `gu-IN`, `pa-IN`, `as-IN`.

The Vocal Allocation Matrix accepts comma-separated detected tags such as `hi-IN, ta-IN`. On an explicit matrix run, recognized tags bias the scoped text query and fill ISO language slots using the existing deterministic parser. This does not silently apply values to AM-Stage segments. Copy or enter the tags you want to use.

## Runtimes and installation

The API route is `POST /api/am-stage/side-metadata`, with multipart fields `specialist=helm|gender|language`, `audio`, `offset`, and `duration`. The server extracts/downmixes the selected WAV or FLAC window to mono PCM WAV at 16 kHz. Audio decoding is limited to formats supported by the local `soundfile` installation. Helm windows are 0.25–10 seconds; the two classifiers accept 0.25–30 seconds.

Optional environment overrides:

```text
AM_STAGE_SAINA_BASE_URL=http://127.0.0.1:11435
AM_STAGE_SAINA_HELM_MODEL=run-saina/saina-helm-3-0.8b
AM_STAGE_GENDER_MODEL_PATH=data/models/am-stage/gender-detection
AM_STAGE_VAKGYATA_MODEL_PATH=data/models/am-stage/vakgyata-tiny
PYTHON_EXECUTABLE=python
```

Saina Helm 3 requires the [Saina Ollama build](https://github.com/ramarlina/ollama/tree/saina-helm-3) and its Helm 3 model tag. Run it side-by-side at port 11435 using [the Windows setup guide](saina-ollama-windows.md); do not replace the stock Ollama under AppData or point the general Ollama settings at Saina. The app sends four typed System One audio gates to `/v1/systemone` only through `AM_STAGE_SAINA_BASE_URL` (default `http://127.0.0.1:11435`). If this endpoint is down, Helm reports that runtime address; if the runtime is up but the model is absent, Helm returns an install hint. It never falls back to stock Ollama on port 11434.

The CPU classifiers load local files only; they do not download weights during an action. From the project root, install only the files required for inference:

```powershell
hf download prithivMLmods/Common-Voice-Gender-Detection config.json preprocessor_config.json model.safetensors --local-dir data/models/am-stage/gender-detection
hf download onecxi/vakgyata-tiny config.json preprocessor_config.json model.safetensors --local-dir data/models/am-stage/vakgyata-tiny
```

Their Python runtime needs `torch`, `transformers`, `numpy`, and `soundfile`. If these packages or model weights are missing, the explicit action reports an actionable install hint or Python error. The Common Voice gender checkpoint is roughly 378 MB of model weights (95M parameters); Vakgyata-tiny has 24.3M parameters. The repository does not track downloaded weights.

## Resource policy

All three actions acquire the existing single-model slot. Before an action, the route unloads active models on the stock Ollama endpoint; normal CLAP, SigLIP, Gemma, and Qwen work already uses that slot or checks it before inference. The Saina Helm server is separate and must be used only for the explicit Helm action. Do not run Helm concurrently with CLAP, SigLIP, Gemma, or Qwen on the RX570 8 GB / 16 GB RAM machine. A Python classifier runs on CPU with CUDA disabled, returns a small JSON result, and its process exits, so classifier weights are not retained in idle memory. Helm sends `keep_alive: 0` and runs only after the explicit button action. Dashboard and status requests never start or load these models. The optional `skip CLAP when has_vocals=false` gate is not enabled or applied.

Local runtime inspected for this implementation: Python 3.14.7, PyTorch 2.14.1 CPU-only, Transformers 5.18.0, soundfile installed; the user fixture `tasks/new/part3.wav` is 48 kHz stereo and about 27.83 seconds. CPU classifier calls do not allocate VRAM in this runtime. No GPU VRAM peak or inference throughput was measured. The audio is divided by the current AM-Stage segment settings before inference, so a whole-track call is not made.

## Validation status

Unit coverage exercises tag normalization, Indian language parsing, segment cropping, mono conversion, 16 kHz resampling, and isolated Saina URL configuration. The Saina runtime/model are not installed by this repository change; install the separate build to run a Helm audio gate. Python classifier paths fail soft until their local model folders are installed. Do not interpret model probabilities as calibrated correctness guarantees.

Model references: [Saina Helm 3](https://ollama.com/run-saina/saina-helm-3-0.8b), [Common-Voice-Gender-Detection](https://huggingface.co/prithivMLmods/Common-Voice-Gender-Detection), [Vakgyata-tiny](https://huggingface.co/onecxi/vakgyata-tiny).
