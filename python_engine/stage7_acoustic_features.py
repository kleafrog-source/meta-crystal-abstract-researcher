"""CPU-only per-segment DSP/MIR features for AM-Stage."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import librosa
import numpy as np
import soundfile as sf


SAMPLE_RATE = 16_000
HOP_LENGTH = 512
MAX_SEGMENT_SECONDS = 30.0
FORMANT_RMS_GATE = 0.008


def _load_audio_range(path: Path, offset: float, duration: float) -> np.ndarray:
    if not np.isfinite(offset) or offset < 0 or not np.isfinite(duration) or duration < 0.25:
        raise ValueError("Select an audio range of at least 0.25 seconds.")
    try:
        with sf.SoundFile(path) as source:
            sample_rate = source.samplerate
            start = min(len(source), int(offset * sample_rate))
            end = min(len(source), int((offset + duration) * sample_rate))
            source.seek(start)
            audio = source.read(end - start, dtype="float32", always_2d=True)
    except Exception as error:
        raise ValueError("This runtime can read audio formats supported by soundfile; convert the source to PCM WAV or FLAC and retry.") from error
    if len(audio) / sample_rate < 0.25:
        raise ValueError("The selected audio window must contain at least 0.25 seconds of audio.")
    mono = np.nan_to_num(audio.mean(axis=1), copy=False)
    if sample_rate != SAMPLE_RATE:
        mono = librosa.resample(mono, orig_sr=sample_rate, target_sr=SAMPLE_RATE)
    return np.clip(mono, -1.0, 1.0).astype(np.float32, copy=False)


def _load_segment(path: Path, offset: float, duration: float) -> np.ndarray:
    if not np.isfinite(duration) or duration > MAX_SEGMENT_SECONDS:
        raise ValueError("Select an audio segment from 0.25 to 30 seconds.")
    return _load_audio_range(path, offset, duration)


def _is_voiced(frame: np.ndarray, sample_rate: int, rms: float) -> bool:
    if rms < FORMANT_RMS_GATE:
        return False
    centered = frame - np.mean(frame)
    energy = float(np.dot(centered, centered))
    if energy <= 1e-12:
        return False
    autocorrelation = np.correlate(centered, centered, mode="full")[len(centered) - 1:]
    min_lag = max(1, int(sample_rate / 400))
    max_lag = min(len(autocorrelation) - 1, int(sample_rate / 70))
    if max_lag <= min_lag:
        return False
    periodicity = float(np.max(autocorrelation[min_lag:max_lag + 1]) / autocorrelation[0])
    return periodicity >= 0.35


def _frame_formants(frame: np.ndarray, sample_rate: int) -> tuple[float, float] | None:
    emphasized = librosa.effects.preemphasis(frame.astype(np.float64, copy=False), coef=0.97)
    windowed = emphasized * np.hamming(len(emphasized))
    try:
        coefficients = librosa.lpc(windowed, order=18)
        roots = np.roots(coefficients)
    except (ValueError, np.linalg.LinAlgError):
        return None
    roots = roots[np.imag(roots) >= 0]
    frequencies = np.angle(roots) * sample_rate / (2 * np.pi)
    bandwidths = -0.5 * (sample_rate / (2 * np.pi)) * np.log(np.maximum(np.abs(roots), 1e-8))
    candidates = sorted(
        float(frequency)
        for frequency, bandwidth in zip(frequencies, bandwidths)
        if 180 <= frequency <= 3_500 and 0 < bandwidth <= 450
    )
    f1 = next((frequency for frequency in candidates if 200 <= frequency <= 1_200), None)
    f2 = next((frequency for frequency in candidates if f1 is not None and max(700, f1 + 150) <= frequency <= 3_000), None)
    if f1 is None or f2 is None:
        return None
    return f1, f2


def _estimate_formants(waveform: np.ndarray, helm_has_vocals: bool | None) -> tuple[dict | None, str | None]:
    if helm_has_vocals is False:
        return None, "helm_negative"
    if float(np.sqrt(np.mean(np.square(waveform)))) < FORMANT_RMS_GATE:
        return None, "low_energy"

    frame_length = int(0.030 * SAMPLE_RATE)
    # A 30 ms hop keeps CPU-only LPC work practical even on 30 s segments.
    hop_length = frame_length
    estimates: list[tuple[float, float]] = []
    voiced_frames = 0
    total_frames = max(0, 1 + (len(waveform) - frame_length) // hop_length)
    for start in range(0, max(0, len(waveform) - frame_length + 1), hop_length):
        frame = waveform[start:start + frame_length]
        rms = float(np.sqrt(np.mean(np.square(frame))))
        if not _is_voiced(frame, SAMPLE_RATE, rms):
            continue
        voiced_frames += 1
        formants = _frame_formants(frame, SAMPLE_RATE)
        if formants:
            estimates.append(formants)

    if len(estimates) < 3:
        return None, "insufficient_voiced_frames"
    values = np.asarray(estimates)
    voiced_ratio = voiced_frames / max(total_frames, 1)
    formant_coverage = len(estimates) / max(voiced_frames, 1)
    return {
        "f1_hz": round(float(np.median(values[:, 0])), 1),
        "f2_hz": round(float(np.median(values[:, 1])), 1),
        "confidence": round(float(np.clip(voiced_ratio * formant_coverage, 0, 1)), 3),
        "voiced_frame_ratio": round(float(np.clip(voiced_ratio, 0, 1)), 3),
        "method": "lpc_heuristic",
    }, None


def analyze_rhythm_events(waveform: np.ndarray) -> dict:
    """Stage 7's shared librosa beat/onset pass, without unrelated DSP features."""
    actual_duration = len(waveform) / SAMPLE_RATE
    onset_envelope = librosa.onset.onset_strength(y=waveform, sr=SAMPLE_RATE, hop_length=HOP_LENGTH)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=SAMPLE_RATE,
        hop_length=HOP_LENGTH,
        units="frames",
        backtrack=False,
    )
    beat_times: list[float] = []
    tempo_bpm: float | None = None
    if len(waveform) >= SAMPLE_RATE:
        tempo, beat_frames = librosa.beat.beat_track(y=waveform, sr=SAMPLE_RATE, hop_length=HOP_LENGTH, units="frames")
        tempo_value = float(np.asarray(tempo).reshape(-1)[0])
        tempo_bpm = round(tempo_value, 2) if np.isfinite(tempo_value) and tempo_value > 0 else None
        beat_times = [round(float(value), 4) for value in librosa.frames_to_time(beat_frames, sr=SAMPLE_RATE, hop_length=HOP_LENGTH) if value <= actual_duration]
    onset_times = [round(float(value), 4) for value in librosa.frames_to_time(onset_frames, sr=SAMPLE_RATE, hop_length=HOP_LENGTH) if value <= actual_duration]
    return {"tempo_bpm_approx": tempo_bpm, "beat_times_seconds": beat_times, "onset_times_seconds": onset_times}


def analyze_waveform(waveform: np.ndarray, helm_has_vocals: bool | None = None) -> dict:
    actual_duration = len(waveform) / SAMPLE_RATE
    rms = librosa.feature.rms(y=waveform, frame_length=2048, hop_length=HOP_LENGTH, center=True)[0]
    spectrum_args = {"y": waveform, "sr": SAMPLE_RATE, "n_fft": 2048, "hop_length": HOP_LENGTH}
    centroid = librosa.feature.spectral_centroid(**spectrum_args)[0]
    bandwidth = librosa.feature.spectral_bandwidth(**spectrum_args)[0]
    rolloff = librosa.feature.spectral_rolloff(**spectrum_args, roll_percent=0.85)[0]
    rhythm = analyze_rhythm_events(waveform)
    formants, formant_skip_reason = _estimate_formants(waveform, helm_has_vocals)
    rms_mean = float(np.sqrt(np.mean(np.square(waveform))))
    return {
        "feature_version": "stage7_librosa_lpc_v1",
        "sample_rate_hz": SAMPLE_RATE,
        "duration_seconds": round(actual_duration, 4),
        "rms_mean": round(rms_mean, 6),
        "rms_min": round(float(np.min(rms)), 6),
        "rms_max": round(float(np.max(rms)), 6),
        "loudness_dbfs_approx": round(float(20 * np.log10(max(rms_mean, 1e-8))), 2),
        "peak": round(float(np.max(np.abs(waveform))), 6),
        "spectral_centroid_mean_hz": round(float(np.mean(centroid)), 2),
        "spectral_bandwidth_mean_hz": round(float(np.mean(bandwidth)), 2),
        "spectral_rolloff_85_mean_hz": round(float(np.mean(rolloff)), 2),
        **rhythm,
        "formants": formants,
        "formant_skip_reason": formant_skip_reason,
    }


def analyze_segment(path: Path, offset: float, duration: float, helm_has_vocals: bool | None = None) -> dict:
    return analyze_waveform(_load_segment(path, offset, duration), helm_has_vocals)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--offset", type=float, default=0)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--helm-has-vocals", choices=("true", "false", "unknown"), default="unknown")
    args = parser.parse_args()
    helm_gate = {"true": True, "false": False, "unknown": None}[args.helm_has_vocals]
    try:
        print(json.dumps(analyze_segment(args.audio, args.offset, args.duration, helm_gate), ensure_ascii=False))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
