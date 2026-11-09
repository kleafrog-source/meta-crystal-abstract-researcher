# Automation Qwen result handoff to Tri-modal Stage

## Supported mapping

This implementation supports one artifact mapping:

`text.qwen.resolved` → `parameter-bank`, schema version 1, bank `qwen-text`, pass `resolved` → the Qwen3 ParameterBank in Tri-modal Stage.

The handoff carries the selected Run, stage, attempt, and artifact IDs. Apply accepts only an artifact owned by that Run/stage/attempt, from the stage's successful attempt, with the expected kind, schema, action, bank, pass, validity, and parameter-array shape. Other Automation artifact types and banks have no Apply mapping in this slice.

## View and Apply

**View** reads and displays the explicitly selected saved artifact. It does not call the producer or mutate the Stage session.

**Apply** validates that selection and updates only the Qwen3 bank. New parameter names can be added. An existing parameter value is not silently overwritten. A user-deleted parameter is recorded as a tombstone and is not restored by an ordinary repeat Apply. Provenance is stored with each imported parameter; source identity and operation receipts make redelivery and ordinary repeat Apply idempotent. An intentional re-apply is a separate operation.

Apply marks the Stage session dirty. It does not save automatically. Use the normal session Save action to persist Qwen parameters, provenance, tombstones, manual edits, applied-source identities, and operation receipts. Save and restore use the existing session snapshot API.

## Manual check

1. In Automation, select the intended Run, stage, attempt, and `qwen-text / resolved` artifact; choose View. Confirm that the result appears and the current Stage bank and dirty state do not change.
2. Apply to Qwen3. Confirm only Qwen3 changes, provenance identifies the selected source, and the session becomes dirty without an automatic save.
3. Save through the normal Stage session control, refresh, and restore that session. Confirm Qwen values and provenance return.
4. Apply the same source again using ordinary Apply; confirm no duplicate parameter names.
5. Edit one imported value and remove another imported parameter. Apply the same source again, Save, refresh, and restore. Confirm the edit and deletion remain.

## Limits

- This is not a general Automation-to-Stage mapping framework. Gemma, CLAP, SigLIP, audio, Work Axis, Brief, node/time-range, and derived artifacts are not implemented by this change.
- Preservation of pre-populated neighboring banks is covered by an automated session API integration test; the browser acceptance used empty neighboring banks.
- A browser-level delayed-response race was not separately exercised. Loading-state rendering is covered by an automated component test.
- No production build or full test suite is claimed by this note.
