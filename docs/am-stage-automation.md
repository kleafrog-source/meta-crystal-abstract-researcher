# AM-Core Automation operations

Automation is available at `/automation` and from the application sidebar. It runs the registered AM-Stage adapters in the server executor; leaving the page does not cancel a Run. The older macro panel remains available as a compatibility entry point and does not own the executor.

## Persistent data and backup

- SQLite database: `prisma/dev.db` in the default local development setup (`DATABASE_URL` can override this location).
- Automation audio assets and result payloads: `data/am-stage-automation/assets/` and `data/am-stage-automation/runs/`.
- Scenario definitions are versioned in the database; compatibility files are stored below `data/am-stage-automation/scenarios/` when used.
- For a consistent backup, stop the dev server, then copy the database and the complete `data/am-stage-automation/` directory together. Keep the pair from the same point in time. `trash/` is transient deletion recovery data; do not use it as the only backup.

Run `pnpm exec prisma migrate deploy` after pulling a release that contains new migrations, then restart the app. In local development, `pnpm exec prisma migrate status` shows whether the checked-out schema and database agree. Do not use `prisma migrate reset` for an existing working database.

## Inputs, routes, and legacy import

Audio is uploaded into the durable asset store and can be replaced or removed from the workbench without creating a new session. Brief text and search settings persist with the workbench. The crystal route requires an explicit crystal selection; it does not draw a new crystal on refresh. Template Brief requires explicit template text and explicit `key=value` substitutions for every placeholder.

### Segment text sampling and Brief assembly

Audio segmentation and Gemma/CLAP/SigLIP analysis still cover every planned segment. Reverse Query and per-segment LLM interpretations use a separate configurable sample (default 5); selection is deterministic and ordered, includes the first and last segment when `K >= 2`, and `K = 1` selects the first. Unselected nodes are retained as `not_selected` in the result artifact.

Reverse Query sends each sampled node's own text-feature snapshot and the common Brief. Its structured response is required because downstream consumers use EN and RU queries plus key concepts; malformed output is retried as a format error, while valid JSON missing usable required fields fails without retry. Each successful node is checkpointed immediately. Transient network/HTTP and malformed-format failures retry only the current node, up to four attempts and a 180-second node budget, with a 45-second request timeout, jittered backoff, and applicable `Retry-After`. Stop cancels a request or backoff. Continue reuses successful checkpoints only when the node input fingerprint still matches.

Brief assembly has independent, explicit source toggles for Reverse Query, per-segment interpretations, text features/tags, and a saved AM-Stage natural-description snapshot. The saved description is optional and is never included unless selected; the Run stores its session ID, snapshot timestamp, language, and exact text. The executor can be FreeLLMAPI, the Ollama chat model from Settings, or a separately selected installed Ollama model. There is no implicit provider fallback and no global model-setting change. Preview reports approximate input size (character-based when no tokenizer is available); oversized prompts stop visibly without silent truncation. Run artifacts retain source selections, per-node input text and statuses, provider/model, size estimate, and resulting Brief.

Legacy automation entries are imported as whole chains. Entries with unsupported actions are reported as incompatible and left untouched; they are never silently shortened into a different chain. Importing an already-present ID is idempotent.

## Run lifecycle

- **Start** freezes the selected scenario version, external inputs, search settings, effective options, and plan into a durable Run.
- **Stop** requests cancellation of the active Run. It does not stop Ollama or other shared providers. An in-flight adapter must honor cancellation; an attempt that returns after Stop is not committed as a successful result.
- **Continue** reuses the saved Plan and inputs, skips successful stages, and retries unfinished/failed stages. To change inputs, create a new Run from the prior one.
- On server restart, a Run that was in-flight is recovered as interrupted; saved attempts and artifacts remain in history. Refresh in the UI fetches state without a full page reload.
- Deleting a Run requires confirmation and is blocked while it is active. Run artifacts are removed only when no other owner references them; shared audio assets are not deleted with a Run.

## Service Bay and available actions

Service Bay remains the source of index/model readiness and manual rebuild controls. Automation previews read readiness and block missing required indexes; they do not silently rebuild indexes. Qwen/Gemma text retrieval, CLAP, SigLIP, Gemma audio, Stage-2 server retrieval, Librosa acoustic analysis, LFM3 description/transcription, Indic detection, text-feature operations, and Vocal Allocation are registered through existing application services. Actual readiness depends on the local model, index, and provider state shown by Service Bay.

The ETA is based only on comparable successful attempts matching action, model/index fingerprints, transition mode, and work unit. Unknown or unmatched stages are shown as unknown; cancelled/failed attempts are retained for diagnostics but never train ETA. Historical ranges are estimates, not service guarantees.

## Known unavailable or deferred capabilities

- Stage-2 client smoothing is not a server automation action; existing client smoothing remains in Tri-Modal Stage.
- Helm/voice presentation is disabled/deferred; no Helm runtime is required for other routes.
- Gemma spectrogram-image action remains a stub until a compatible image adapter is available.
- Segment-level editing/continue, parallel Runs, and the future text editor remain deferred as listed in `tasks/automation/TASK.md`.
- Model calls require the configured local providers and compatible ready indexes. Resource coordination is single active Run / shared model slot; Automation does not keep models loaded while idle.

## Exports and handoff

A Run can be exported as JSON, while each artifact can be downloaded separately as TXT or JSON. `View in Tri-Modal Stage` opens a selected result without applying it; `Apply to workbench` is a separate explicit action. Audio and artifact source references remain attached for traceability.
