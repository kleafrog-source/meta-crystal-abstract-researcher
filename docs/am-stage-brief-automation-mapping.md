# Automation Brief → Stage mapping

## Supported source

The only supported producer in this slice is `brief.combine_segment_texts` with `kind: brief`, `schemaVersion: 1`, `modality: text`, `validity: valid`, and a non-empty string at `data.text`. Stage accepts it only when the artifact is owned by the explicitly selected Run and stage, belongs to the stage's `successfulAttemptId`, and its artifact ID and attempt ID match the selected identities.

Other Brief producers, descriptions, transcriptions, and other Stage targets are outside this mapping.

## View and Apply

View reads the selected saved artifact into the historical result panel. It does not change the Stage query, import metadata, or dirty state, and it does not call a producer, search, or save operation.

Apply writes the text to the working Stage Brief (`v3.query`) and records import provenance. It marks the session dirty; the user saves through the existing session Save action. Apply does not search, auto-save, or change Qwen, other parameter banks, Work Axis, the source artifact, or the Run's immutable inputs.

An empty Brief can be filled directly. A different non-empty Brief requires explicit confirmation that displays both texts. Cancel leaves the target unchanged. Before confirmation is accepted, the UI rechecks the current text, target session, and selected artifact; stale proposals must be reviewed again.

## Repeats, edits, and provenance

Each operation ID has a receipt bound to one source identity (`runId`, `stageId`, `attemptId`, `artifactId`). Re-delivering the same operation is a no-op; reusing its ID for another source is rejected. An ordinary Apply of a previously applied source is also a no-op, preserving subsequent manual edits. Replacing an edited Brief requires the explicit replacement action and confirmation. If incoming text already equals the current text, the query remains unchanged while source/receipt metadata is updated.

The optional `v3.brief_import` snapshot field stores source identity, the imported text, a manual-edit marker, applied source keys, and operation receipts. Older snapshots without this field continue to restore with no Brief import metadata. No full Brief revision history is maintained.

## Manual check

1. Open a saved `brief.combine_segment_texts` artifact with the matching successful attempt in Tri-modal Stage.
2. View it and confirm the current Brief and dirty indicator do not change.
3. Apply into an empty Brief, save, refresh/restore, and confirm text and source details return.
4. Apply the same artifact again; confirm there is no duplicate or text overwrite.
5. Edit the Brief manually and repeat ordinary Apply; confirm the edit remains.
6. Request replacement, cancel once and verify no change; request again, confirm, save, and verify the imported text and provenance.

## Limits

This mapping does not provide general conflict resolution, a universal artifact import framework, full Brief revision history, or mappings for other producers, banks, or Work Axis. Browser acceptance is required in addition to automated tests.
