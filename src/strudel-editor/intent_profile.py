from __future__ import annotations

import argparse
import json
import re


TEMPO_HINTS = {
    "slow": (56, 82),
    "ambient": (50, 76),
    "lofi": (70, 92),
    "hip hop": (72, 96),
    "trap": (120, 150),
    "techno": (126, 142),
    "house": (118, 130),
    "dnb": (160, 176),
    "fast": (128, 160),
}

ROLE_HINTS = {
    "drums": ["drum", "kick", "snare", "hat", "beat", "groove", "percussion", "ритм", "бочка", "хэт"],
    "bass": ["bass", "sub", "low-end", "бас", "саб"],
    "harmony": ["pad", "chord", "harmony", "voicing", "аккорд", "гармония", "пэд"],
    "melody": ["lead", "melody", "arp", "arpeggio", "hook", "melod", "лид", "арпеджио", "мелод"],
    "texture": ["texture", "noise", "space", "room", "ambient", "атмосфер", "текстур", "шум"],
}

MOOD_HINTS = {
    "dark": ["dark", "grim", "ominous", "темный", "мрач"],
    "warm": ["warm", "soft", "cozy", "тёпл", "мягк"],
    "aggressive": ["aggressive", "hard", "distorted", "dirty", "агрессив", "жестк", "грязн"],
    "playful": ["playful", "game", "retro", "игров", "ретро"],
    "cinematic": ["cinematic", "epic", "score", "саундтрек", "кинемат"],
    "hypnotic": ["hypnotic", "rolling", "looping", "гипнотич", "rolling"],
}

FORM_HINTS = {
    "sketch": 16,
    "loop": 16,
    "track": 32,
    "song": 32,
    "full": 48,
    "long": 64,
}


def profile_for_query(query: str) -> dict:
    text = query.lower()
    tempo_min, tempo_max = 96, 124
    for hint, (low, high) in TEMPO_HINTS.items():
        if hint in text:
            tempo_min, tempo_max = low, high
            break

    requested_roles = []
    for role, hints in ROLE_HINTS.items():
        if any(hint in text for hint in hints):
            requested_roles.append(role)
    if not requested_roles:
        requested_roles = ["drums", "bass", "harmony", "melody", "texture"]

    moods = [mood for mood, hints in MOOD_HINTS.items() if any(hint in text for hint in hints)]
    if not moods:
        moods = ["neutral"]

    bars_target = 32
    for hint, bars in FORM_HINTS.items():
        if re.search(rf"\b{re.escape(hint)}\b", text):
            bars_target = bars
            break
    if any(word in text for word in ("ambient", "cinematic", "journey", "development", "развит")):
        bars_target = max(bars_target, 48)

    complexity = "medium"
    if any(word in text for word in ("minimal", "simple", "sparse", "миним", "простой")):
        complexity = "low"
    elif any(word in text for word in ("complex", "rich", "layered", "dense", "сложн", "плотн")):
        complexity = "high"

    return {
        "query": query,
        "tempo_range": [tempo_min, tempo_max],
        "requested_roles": requested_roles,
        "moods": moods,
        "bars_target": bars_target,
        "complexity": complexity,
        "prefers_minor": any(word in text for word in ("dark", "minor", "мрач", "минор")),
        "prefers_major": any(word in text for word in ("happy", "bright", "major", "светл", "мажор")),
        "requires_variation": not any(word in text for word in ("static", "one loop", "без развития")),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a heuristic intent profile from a music query.")
    parser.add_argument("query", type=str)
    args = parser.parse_args()
    print(json.dumps(profile_for_query(args.query), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
