# LLM providers, appearance, and AM-Core

## Text provider setup

Open **Settings → LLM provider** to choose Ollama, FreeLLMAPI, or the explicit Mock provider. FreeLLMAPI uses the OpenAI-compatible API at `http://localhost:3001/v1` by default. Set `FREELLMAPI_API_KEY` in the server environment before using it. You can set `FREELLMAPI_BASE_URL` to change the default URL. The settings page accepts a per-project endpoint override and lists models exposed by `/models`.

Choose **Auto** to let the FreeLLMAPI router select a model, or choose a listed model directly. The app reports the requested model and, when the server sends `X-Routed-Via`, the actual provider and model. FreeLLMAPI request failures are returned to the caller; they do not silently switch to mock output. Embeddings continue to use the configured local Ollama URL and embedding model, so changing the text provider does not change an index's embedding space.

## Appearance

The sidebar appearance controls select one of six color presets and Dark, Medium, or Light mode. The selection is saved per application page. **Settings → Appearance editor** lets you adjust background hue, saturation and intensity, active accent color, and badge style and intensity for each preset and mode. Save stores the preset, Reset restores that preset's defaults across all three modes, and Cancel discards unsaved editor changes. Surface colors, text, and borders are derived from the chosen background values.

## AM-Core Engine

AM-Core keeps Single Query and Transition A/B as separate modes and retains retrieval, anchors and axes, parameter filtering, and Clean Macro output. The card control offers Detail, Standard, and Compact layouts. Detail includes parameter metadata and keyboard hints; Compact uses discrete options for Select controls and range steps for numeric controls. Query A/B share paste undo and redo history for clipboard paste and inserted crystal blocks.

The AM-Core rosette indicates the current engine state and animates on activation. Macro parameter names and values are visually distinguished while copy and export use the original macro text.

## Shared LLM paths

The provider factory in `src/lib/llm/factory.ts` is shared by chat, chat streaming, pipeline generation, crystal interpretation, manifestation, the GW collapser, the Meta-Crystal V3 proposal route, Combinatorial Genesis metadata normalization, and Metis. MMSS retraining passes the selected provider settings to the Python sidecar; its text teacher uses FreeLLMAPI when selected while embeddings remain on Ollama. The AM-Core and other retrieval-only paths keep their existing local embedding and index behavior.

FreeLLMAPI is compatible with the API documented at [FreeLLMAPI's repository](https://github.com/FreeLLMAPI/FreeLLMAPI), including `/v1/chat/completions`, `/v1/models`, the `auto` model, and `X-Routed-Via` routing metadata.
