# Torus Atlas Implementation Checklist

Updated: 2026-07-30

## Purpose

This file is a working checklist for the `Torus Atlas` direction.
It records:

- what is already implemented
- where the current implementation stopped
- what the next phases are
- which storage and checkpoint decisions are planned
- how to avoid full atlas rebuilds after library growth

The file is intentionally short-per-step and operational, so it can be updated as implementation progresses.

---

## Current State

### Already implemented

- Separate `Torus Atlas` section exists in the app.
- `Torus Atlas` does not replace existing `GW-Collapser` screens.
- Atlas list endpoint exists and reads torus atlas metadata from crystal `metadataJson`.
- New global atlas rebuild flow exists.
- New full atlas rebuild flow exists.
- Full rebuild has progress polling in UI.
- Full rebuild now has file-backed checkpoints and snapshot persistence.
- Full rebuild persist phase now writes in batches of `50`.
- Full rebuild now supports:
  - `Pause`
  - `Resume`
  - `Restart`
  - `Discard`
- Layout compatibility by `layoutKey` is enforced in canvas view.
- Diagnostic slice mode exists for small selected subsets.
- `combination-only` mode now sends only `combination` formulas in `docs[]`.
- `query` is neutral service text and not descriptive payload.
- Canvas display radii are separated from persisted torus geometry naming.
- Topology clustering is added on top of torus coordinates using cyclic features:
  - `cos(u), sin(u), cos(v), sin(v)`
- Both cluster families are now available:
  - semantic labels from sidecar
  - torus topology labels computed locally
- UI can switch between:
  - `Torus Clusters`
  - `Semantic Clusters`
- Bulk selection no longer depends on current visible page rows.
- `Bulk Select Dialog` exists for:
  - first `100`
  - first `200`
  - first `1000`
  - all by current filter
- `Selection Summary` exists.
- `Show only selected` mode exists.
- Compact browse list and bulk-selection workflow are now separated.
- Rule-based bulk selection now exists for:
  - current filter
  - current layoutKey
  - current semantic cluster
  - current torus cluster
  - duplicate formulas
- Working sets now exist:
  - save selection
  - load selection
  - delete selection
- Incremental atlas append endpoint exists for new crystals against the current canonical atlas snapshot.

### Current stop point

- File-based append-only `progress.log` and `errors.log` are now implemented.
- Incremental append currently uses a pragmatic reuse path and should be treated as v1, not final canonical model reuse.
- Full rebuild now has in-UI log inspection and a selected-items drawer.
- Full rebuild now shows elapsed time and ETA in the progress card.

---

## Data Model Decisions Already In Use

### Crystal metadata storage

Atlas data is stored inside each crystal `metadataJson`.

Current atlas-related fields include:

- `torusAtlas.layoutKey`
- `torusAtlas.scope`
- `torusAtlas.layoutSize`
- `torusAtlas.documentMode`
- `torusAtlas.storedAt`
- `torusAtlas.geometryR`
- `torusAtlas.geometryr`
- `torusAtlas.torusU`
- `torusAtlas.torusV`
- `torusAtlas.torusX`
- `torusAtlas.torusY`
- `torusAtlas.torusZ`
- `torusAtlas.clusterLabel`
- `torusAtlas.semanticClusterLabel`
- `torusAtlas.torusClusterLabel`

Mirrors also exist at top level where useful:

- `clusterLabel`
- `semanticClusterLabel`
- `torusClusterLabel`
- `torusX`
- `torusY`
- `torusZ`

### Job state storage

Current full rebuild job status is stored in `Setting`.

This is acceptable for a first implementation, but not enough for strong resume/checkpoint support.

---

## Next Main Phase

### Phase 1: Resumable Full Rebuild With Checkpoints

Goal:

- run `Rebuild Full Atlas` in batches of `50`
- display exact progress
- continue from checkpoint after interruption
- avoid rerunning full persist phase from the beginning

Substeps:

1. Split full rebuild into explicit phases.
   - `preparing`
   - `analyzing`
   - `analysis_ready`
   - `persisting`
   - `paused`
   - `completed`
   - `failed`

2. Persist checkpoint state explicitly.
   - current `jobId`
   - current `layoutKey`
   - params hash or params snapshot
   - total crystals in run
   - batch size
   - current offset / next offset
   - processed count
   - current phase
   - last error
   - timestamps

3. Save full analysis snapshot separately from crystal rows.
   - do not rely only on in-memory sidecar result
   - store atlas output for replayable persist phase
   - allow resume after process crash without rerunning sidecar analysis

4. Change persist phase to write in chunks of `50`.
   - batch write
   - update checkpoint after every successful batch
   - keep job UI in sync

5. Add control actions.
   - `Pause`
   - `Resume`
   - `Restart`
   - `Discard checkpoint`

6. Make resume semantics strict.
   - if `analysis_ready` exists, resume from persist checkpoint
   - if snapshot file is missing, require clean restart

---

## Phase 2: Proper Storage For Rebuild Snapshots And Logs

Status: partially implemented

Goal:

- allow large atlas jobs to survive restarts
- keep debug and process history inspectable
- permit file-based logging where that is cleaner than DB-only state

Important fixed decision:

- it is allowed to create new files if storing process data in files is cleaner
- file-based logging and checkpoint storage are explicitly allowed

Planned storage approach:

1. Keep lightweight current job pointer in `Setting`.
2. Store larger rebuild artifacts in files.
3. Store one folder per rebuild job.

Suggested folder shape:

- `data/torus_atlas/jobs/<jobId>/job.json`
- `data/torus_atlas/jobs/<jobId>/snapshot.json`
- `data/torus_atlas/jobs/<jobId>/progress.log`
- `data/torus_atlas/jobs/<jobId>/errors.log`

What each file is for:

- `job.json`
  - canonical checkpoint state
- `snapshot.json`
  - full analysis result mapped per crystal
- `progress.log`
  - append-only progress markers per batch
- `errors.log`
  - append-only failures and retry notes

Why this is useful:

- much easier resume logic
- much easier debugging
- easier to inspect partial or failed runs manually
- avoids bloating `Setting` with large payloads

Implemented now:

- `job.json`
- `snapshot.json`

Still pending:

- historical job browser if multi-job inspection becomes necessary

---

## Phase 3: Bulk Selection UX For 100 / 200 / 1000 Items

Status: implemented in first usable slice

Goal:

- selection should not depend on visible page rows
- user must be able to stage large groups without rendering large lists near canvas

Substeps:

1. Separate browsing list from bulk selection model.
   - page list stays compact
   - bulk selection becomes query/filter driven

2. Add `Bulk Select Dialog`.
   - select first `100`
   - select first `200`
   - select first `1000`
   - select all by current filter
   - append to current selection
   - replace current selection

3. Add `Selection Summary Bar`.
   - selected count
   - current filter scope
   - layoutKey distribution
   - cluster distribution

4. Add `Show only selected`.
   - keep list lightweight
   - let user inspect only staged items

5. Add `Selection by rule`.
   - by search query
   - by layoutKey
   - by semantic cluster
   - by torus cluster
   - by duplicates

6. Consider saved working sets.
   - save current selection under a name
   - reopen later

Implemented now:

- `Bulk Select Dialog`
- select first `100`
- select first `200`
- select first `1000`
- select all by current filter
- append vs replace selection
- `Selection Summary`
- `Show only selected`

Still pending:

- saved working set metadata improvements if needed

---

## Phase 4: Large List UX Cleanup

Status: implemented in first usable slice

Goal:

- reduce confusion and UI load
- keep canvas responsive

Substeps:

1. Keep current side list small and paginated for inspection only.
2. Move heavy selection work into drawer/dialog.
3. Add optional selected-items drawer or table view.
4. Consider virtualization only if still needed after selection tools improve.

Note:

- virtualization may help, but it is not the first fix
- the main problem is selection workflow, not only raw rendering

Implemented now:

- compact browse list remains paginated
- bulk selection moved into dedicated dialog
- selected-only inspection mode added
- heavy selection work is no longer tied to visible page rows

Still pending if needed later:

- virtualization if future scale still demands it

---

## Phase 5: Incremental Atlas Updates For Library Growth

Goal:

- avoid running `Rebuild Full Atlas` from scratch every time new crystals are added

This requirement must be treated as first-class, not as a later optimization.

### Planned strategy

1. Distinguish between:
   - full canonical atlas rebuild
   - incremental atlas append/update

2. Keep one current canonical atlas snapshot.
   - stable `layoutKey`
   - stable geometry params
   - stable clustering mode definitions

3. For new crystals:
   - compute embeddings only for new items
   - project them into existing atlas space
   - assign semantic cluster relative to existing model or nearest centroid
   - assign torus topology cluster from resulting `u/v`
   - persist only new items

4. Store reusable atlas model artifacts.
   - centroids
   - projection basis if needed
   - cluster mapping info
   - geometry params

5. Only require full rebuild when:
   - projection model changes
   - clustering strategy changes
   - atlas quality degrades too much
   - user explicitly requests canonical rebuild

### Open technical question to resolve later

There are two possible incremental strategies:

1. Reuse canonical full-atlas model and place new points into existing space.
2. Maintain a separate pending delta atlas and merge later.

Preferred direction for now:

- reuse one canonical atlas model if possible
- avoid delta fragmentation unless required

---

## Phase 6: Better Diagnostics Before Large Runs

Goal:

- use small-slice validation before large atlas operations

Substeps:

1. Keep `Diagnose Slice` as preflight tool.
2. Expand it with:
   - duplicate formula counts
   - semantic histogram
   - torus histogram
   - sampled preview rows
3. Optionally add raw payload viewer later.
4. Add warnings when:
   - semantic labels collapse into one cluster
   - too many duplicates exist
   - coordinates are missing

---

## Interface Elements Still Missing

### High priority

- canonical incremental atlas reuse beyond pragmatic v1 append
- append/rebuild compatibility policy for newly added crystals without manual intervention

### Medium priority

- `Saved Working Sets` metadata polish
- `Resume / Restart` confirmations
- historical atlas job browser

### Lower priority

- raw payload viewer
- list virtualization if still needed
- richer selected-set drilldown if the current drawer becomes insufficient

---

## Immediate Next Implementation Order

1. Improve canonical atlas reuse model for incremental append.
2. Add compatibility rules for automatic atlas append when the library grows.
3. Add restart/resume confirmations if operator mistakes become frequent.
4. Add historical job browsing only if one-current-job inspection stops being enough.

---

## Notes For Future Updates

- Keep this file updated after every meaningful atlas change.
- When a phase is implemented, move it from “planned” to “already implemented”.
- If a storage decision changes, record the new rule here first.
- If a shortcut is taken temporarily, mark it explicitly as temporary.
