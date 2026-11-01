"""Published AM-Core parameter field allowlist shared by data and index writers."""

from __future__ import annotations

import json
from typing import Any


PUBLISHED_PARAMETER_FIELDS = (
    "technical_name", "name_ru", "description_en", "description_ru", "category", "sub_category",
    "ui_element", "min_value", "max_value", "step", "default", "unit", "quantity_kind",
    "options", "lyria_prompt_tags", "semantic_keywords", "domain", "domain_layer",
)
PUBLISHED_PARAMETER_TYPES = frozenset({"Range", "Select", "Toggle", "Text", "String", "Array"})
PUBLISHED_DOMAIN_LAYERS = frozenset({
    "VOCAL_MORPHOLOGY_LAYER", "SYNTHESIS_PHYSICS_LAYER", "SPECTRAL_DSP_LAYER",
    "SPATIAL_BINAURAL_LAYER", "DYNAMICS_ENVELOPE_LAYER", "TEMPORAL_RHYTHM_LAYER",
    "GENERATIVE_CHAOS_LAYER", "COMPOSITIONAL_VECTOR_LAYER", "MODULATION_PERFORMANCE_LAYER",
})


def clean_published_parameter(parameter: dict[str, Any]) -> dict[str, Any]:
    """Return only lexical/control fields, dropping fields inapplicable to the control type."""
    clean = {key: parameter[key] for key in PUBLISHED_PARAMETER_FIELDS if key in parameter}
    domain_layer = clean.get("domain_layer")
    if domain_layer is not None and (not isinstance(domain_layer, str) or domain_layer not in PUBLISHED_DOMAIN_LAYERS):
        raise ValueError("domain_layer must be one published domain layer string or null")
    ui_element = clean.get("ui_element")
    if ui_element not in {"Range", "Toggle"}:
        for key in ("min_value", "max_value", "step"):
            clean.pop(key, None)
    if ui_element != "Select":
        clean.pop("options", None)
    return clean


def out_of_band_fields(parameter: dict[str, Any]) -> dict[str, Any]:
    clean = clean_published_parameter(parameter)
    return {key: value for key, value in parameter.items() if key not in clean}


def parameter_text(parameter: dict[str, Any]) -> str:
    """CLAP retrieval text is restricted to the documented lexical allowlist."""
    allowed = (
        "technical_name", "name_ru", "description_en", "description_ru", "category", "sub_category",
        "ui_element", "unit", "quantity_kind", "lyria_prompt_tags", "semantic_keywords", "domain", "domain_layer",
    )
    fields = clean_published_parameter(parameter)
    if fields.get("ui_element") == "Select":
        allowed += ("options",)
    parts: list[str] = []
    for key in allowed:
        value = fields.get(key)
        if value in (None, "", [], {}):
            continue
        rendered = str(value) if not isinstance(value, (list, dict)) else json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        parts.append(f"{key.replace('_', ' ')}: {rendered}")
    return ". ".join(parts)
