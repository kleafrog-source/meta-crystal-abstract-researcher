# AM-Stage Automation outputs

Automation runs its selected steps in order and keeps the result from each successful step in the Project panel. Each step output can be downloaded as plain text (`technical_name: value`) or JSON with the stable internal step ID, a translated display label, generation time, and parameter records.

The intended pipeline is:

1. Run Brief / semantic retrieval into a model-specific text bank.
2. Run audio or spectrogram retrieval into its own source bank.
3. Optionally resolve Gemma values or run client/server Stage-2.
4. Build track or per-segment text features from selected CLAP, SigLIP, and Gemma audio banks.
5. Export each completed automation step, then export the final text-feature snapshot or timeline separately.

Step outputs are held in the active page state for the current visit; session snapshots continue to store the underlying banks and workbench state. A failed or cancelled step does not emit a success output, and earlier successful outputs remain available until cleared or a new automation run starts.
