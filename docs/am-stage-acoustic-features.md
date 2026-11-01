# AM-Stage acoustic features · Stage 7

Stage 7 adds CPU-only, on-demand librosa analysis for the currently selected AM-Stage segment. It does not start from page load, navigation, status polling, session restore, or CLAP/SigLIP analysis. The button is in the selected segment's specialist panel: **Extract acoustic features**. Segment windows must be 0.25–30 seconds.

The API is `POST /api/am-stage/acoustic-features`. It reserves the shared inference slot to avoid competing with active neural jobs, but it does not load a model or unload Ollama. It runs `python_engine/stage7_acoustic_features.py` in a short-lived CPU process with CUDA disabled. `librosa`, NumPy, and soundfile are already listed in `requirements.txt`; no new model weights are downloaded.

## Segment side-meta fields

Results are stored at `segment.sideMeta.acoustic_features` in the existing `am_stage_session_v1` snapshot. The contract is part of [`segment-side-meta-v1.schema.json`](schemas/segment-side-meta-v1.schema.json) and `SegmentAcousticFeatures` in `src/lib/segment-side-meta.ts`.

| Field | Unit / meaning |
| --- | --- |
| `rms_mean`, `rms_min`, `rms_max` | Linear amplitude, normalized PCM range 0–1 |
| `loudness_dbfs_approx` | 20·log10(mean RMS); simple digital level estimate, not LUFS |
| `peak` | Maximum absolute sample amplitude, normalized PCM 0–1 |
| `spectral_centroid_mean_hz` | Mean spectral centroid in Hz |
| `spectral_bandwidth_mean_hz` | Mean spectral bandwidth in Hz |
| `spectral_rolloff_85_mean_hz` | Mean frequency below which 85% of spectral energy lies |
| `tempo_bpm_approx` | Approximate librosa beat-tracker estimate; `null` for too-short/undetected beat tracks |
| `beat_times_seconds` | Beat locations relative to the start of this segment |
| `onset_times_seconds` | Detected onset locations relative to the start of this segment |
| `formants` | Median LPC F1/F2 estimate from periodic voiced frames, or `null` |

Timing arrays are deliberately segment-relative. A later Stage 8 consumer can form track-relative positions with `segment.offset + time_seconds`; Stage 7 does not create a beat grid, quantize events, or align windows. Feature sample rate is normalized to 16 kHz.

## Formant behavior and Vocal Morphology UI

F1/F2 use a lightweight LPC heuristic on 30 ms frames, with a 30 ms hop. Frames need both a minimum RMS level and a periodicity score; at least three frames must yield plausible formants. If the segment has stored Helm `has_vocals=false`, formant estimation is skipped. Silence, unvoiced/noisy signals, or insufficient valid frames return `formants: null` with a reason. This is an approximate acoustic descriptor, not phonetic recognition or a calibrated confidence score. The displayed confidence is a heuristic coverage ratio.

When valid F1/F2 are extracted, the latest values are copied to a small same-browser localStorage bridge and shown in the **AM-Vocal Morphology Matrix** page. The full per-segment output remains in the AM-Stage timeline and persists with a saved session snapshot. A later extraction without valid formants clears that latest-value bridge so stale values are not presented as current.

## Scope and optional MIR

The CPU path is librosa only. Essentia was not added, and OpenL3/PANNs are not included. No index, embedding cache, or Stage 8 behavior is created or rebuilt. Helm remains optional: Stage 7 respects an already stored negative gate but does not call Helm or require it.

Validation: `python -m unittest discover -s python_engine/tests -p 'test_stage7_acoustic_features.py'` (with `PYTHONPATH=python_engine`) covers statistics, relative timelines, formant gating, and a synthetic vowel-like signal. Vitest covers cross-segment metadata storage and the Vocal Morphology bridge.
