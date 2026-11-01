# UI localization: intentionally untranslated content and known limits

The EN/RU dictionary in `src/lib/ui-i18n.tsx` is applied only to exact, registered UI phrases. German (`de`) uses the English dictionary. The selector and persistence are shared; language changes are applied in the current page without reload.

## Exclusions

| Location / key | Language | Reason | Note |
|---|---|---|---|
| Sidebar legacy group and `LEGACY_NAV_ITEMS` in `src/components/layout/Sidebar.tsx` | EN and RU | `legacy_deferred` | Legacy & Research routes are explicitly out of scope. |
| Product labels: Abstract-Mindfreak, AM-Core, AM Tri-Modal Stage, AM-Stage | EN and RU | `brand` | Canonical product and mode names are retained. |
| Model/provider/protocol names: SigLIP2, CLAP, Ollama, FreeLLMAPI, V3, TECH4, FX4, LAION-CLAP | EN and RU | `model_id` | Keep identifiers stable for users and diagnostics. |
| Parameter catalogue records, technical names, bilingual parameter names/descriptions, control-bank values | EN and RU | `parameter_data` | Runtime text matching is exact and data/code containers are excluded; catalogue JSON and parameter records are not modified. |
| Clean Macro output, generated parameter text, timeline values and exported JSON/Markdown payloads | EN and RU | `export_payload` | These are user data and machine-readable content, not UI copy. `pre`, `code`, form fields and explicitly marked payload nodes are excluded. |
| Console/debug lines and raw machine status strings | EN and RU | `logging` | Parser-facing and diagnostic content remains unchanged. |
| Unregistered or ambiguous strings | EN and RU | `uncertain` | Exact-match lookup leaves unknown copy untouched rather than guessing. Add reviewed UI phrases to `UI_COPY` when identified. |

## Coverage note

Localization is centralized and avoids translating parameter/export data, but exact-match coverage depends on phrases being present in `UI_COPY`. Text assembled from multiple React nodes or dynamic interpolation may remain in its source language until registered or wired through `useUiText()`. This registry is intentionally explicit about that limitation; it does not claim that every rendered string has been audited. German translations are not authored.
