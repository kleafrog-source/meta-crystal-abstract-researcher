"""Compute Stage 7-compatible rhythm events for a selected audio range once."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from stage7_acoustic_features import MAX_SEGMENT_SECONDS, SAMPLE_RATE, _load_audio_range, analyze_rhythm_events


def analyze_window_sources(path: Path, offset: float, duration: float) -> list[dict]:
    waveform = _load_audio_range(path, offset, duration)
    chunk_size = int(MAX_SEGMENT_SECONDS * SAMPLE_RATE)
    windows: list[dict] = []
    for start in range(0, len(waveform), chunk_size):
        chunk = waveform[start:start + chunk_size]
        if len(chunk) < int(0.25 * SAMPLE_RATE):
            continue
        start_seconds = start / SAMPLE_RATE
        features = {
            "feature_version": "stage7_librosa_lpc_v1",
            "sample_rate_hz": SAMPLE_RATE,
            "duration_seconds": round(len(chunk) / SAMPLE_RATE, 4),
            **analyze_rhythm_events(chunk),
        }
        windows.append({
            "offset": round(offset + start_seconds, 4),
            "duration": features["duration_seconds"],
            "acoustic_features": features,
        })
    if not windows:
        raise ValueError("The selected audio range must contain at least 0.25 seconds of audio.")
    return windows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--offset", type=float, required=True)
    parser.add_argument("--duration", type=float, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps({"windows": analyze_window_sources(args.audio, args.offset, args.duration)}, ensure_ascii=False))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
