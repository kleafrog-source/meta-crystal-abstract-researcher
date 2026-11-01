"""Explicit, short-window audio classification for AM-Stage side metadata."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
import soundfile as sf


LANGUAGE_CODES = {
    "english": ("en-IN", "English (India)"),
    "english (india)": ("en-IN", "English (India)"),
    "hindi": ("hi-IN", "Hindi"),
    "odia": ("or-IN", "Odia"),
    "oriya": ("or-IN", "Odia"),
    "bengali": ("bn-IN", "Bengali"),
    "tamil": ("ta-IN", "Tamil"),
    "telugu": ("te-IN", "Telugu"),
    "kannada": ("kn-IN", "Kannada"),
    "malayalam": ("ml-IN", "Malayalam"),
    "marathi": ("mr-IN", "Marathi"),
    "gujarati": ("gu-IN", "Gujarati"),
    "punjabi": ("pa-IN", "Punjabi"),
    "assamese": ("as-IN", "Assamese"),
}


def load_segment(path: Path, offset: float, duration: float) -> np.ndarray:
    if offset < 0 or duration <= 0 or duration > 30:
        raise ValueError("Select an audio window from 0.25 to 30 seconds.")
    try:
        audio, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    except Exception as error:
        raise ValueError("This runtime can read WAV/FLAC audio. Convert the source to PCM WAV and retry.") from error
    start = min(len(audio), int(offset * sample_rate))
    end = min(len(audio), int((offset + duration) * sample_rate))
    if end <= start or (end - start) / sample_rate < 0.25:
        raise ValueError("The selected audio window must contain at least 0.25 seconds of audio.")
    mono = np.nan_to_num(audio[start:end].mean(axis=1), copy=False)
    if sample_rate != 16_000:
        source_positions = np.arange(len(mono), dtype=np.float64) / sample_rate
        target_length = max(1, round(len(mono) * 16_000 / sample_rate))
        target_positions = np.arange(target_length, dtype=np.float64) / 16_000
        mono = np.interp(target_positions, source_positions, mono).astype(np.float32)
    return np.clip(mono, -1.0, 1.0).astype(np.float32, copy=False)


def normalized_label(label: str) -> str:
    text = label.lower().strip().replace("_", " ").replace("-", " ")
    if text.startswith("label "):
        text = text.removeprefix("label ").strip()
    return text


def language_for_label(label: str) -> tuple[str, str] | None:
    normalized = label.lower().strip().replace("_", "-")
    for code, name in LANGUAGE_CODES.values():
        if normalized == code.lower():
            return code, name
    return LANGUAGE_CODES.get(normalized_label(label))


def classify(kind: str, model_path: Path, waveform: np.ndarray) -> dict:
    try:
        import torch
        from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
    except ImportError as error:
        raise RuntimeError("Install the optional local classifier runtime: python -m pip install torch transformers soundfile") from error
    if not (model_path / "config.json").is_file() or not any(model_path.glob("*.safetensors")):
        raise FileNotFoundError(f"Model files are missing in {model_path}. Follow docs/am-stage-side-metadata.md to install this optional model.")

    extractor = AutoFeatureExtractor.from_pretrained(str(model_path), local_files_only=True)
    model = AutoModelForAudioClassification.from_pretrained(str(model_path), local_files_only=True).to("cpu").eval()
    inputs = extractor(waveform, sampling_rate=16_000, return_tensors="pt")
    with torch.inference_mode():
        logits = model(**inputs).logits[0]
    probabilities = logits.softmax(dim=-1).cpu().tolist()
    id2label = model.config.id2label
    labels = [str(id2label.get(index, id2label.get(str(index), f"LABEL_{index}"))) for index in range(len(probabilities))]

    if kind == "gender":
        scores = {normalized_label(label): float(probability) for label, probability in zip(labels, probabilities)}
        female = next((score for label, score in scores.items() if "female" in label), None)
        male = next((score for label, score in scores.items() if "male" in label and "female" not in label), None)
        if female is None or male is None:
            # This published checkpoint documents class 0=female, class 1=male.
            female, male = (float(probabilities[0]), float(probabilities[1])) if len(probabilities) == 2 else (0.0, 0.0)
        score = max(female, male)
        label = "unknown" if score < 0.60 else "female" if female >= male else "male"
        return {
            "model": "prithivMLmods/Common-Voice-Gender-Detection",
            "label": label,
            "score": score,
            "probabilities": {"female": female, "male": male},
            "semantics": "acoustic_voice_presentation",
        }

    ranked = sorted(zip(labels, probabilities), key=lambda item: item[1], reverse=True)
    tags = []
    for raw_label, probability in ranked:
        code_and_name = language_for_label(raw_label)
        if code_and_name:
            code, name = code_and_name
            tags.append({"code": code, "label": name, "confidence": float(probability)})
        if len(tags) == 3:
            break
    top_confidence = tags[0]["confidence"] if tags else 0.0
    if top_confidence < 0.45:
        tags = []
    return {"model": "onecxi/vakgyata-tiny", "tags": tags, "top_confidence": top_confidence}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=("gender", "language"))
    parser.add_argument("--audio", type=Path, required=True)
    parser.add_argument("--offset", type=float, default=0)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--model-path", type=Path)
    parser.add_argument("--prepare-output", type=Path)
    args = parser.parse_args()
    try:
        waveform = load_segment(args.audio, args.offset, args.duration)
        if args.prepare_output:
            sf.write(args.prepare_output, waveform, 16_000, subtype="PCM_16", format="WAV")
            result = {"sample_rate": 16_000, "duration_seconds": len(waveform) / 16_000}
        else:
            if not args.kind or not args.model_path:
                raise ValueError("Classification requires --kind and --model-path.")
            result = classify(args.kind, args.model_path, waveform)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
