# SigLIP2 minimum-value regression

SigLIP2 retrieval produced ranked parameter hits correctly; the defect was in value anchoring.
Range, Select, and Toggle anchor prompts appended the level or option after long catalogue context.
The SigLIP2 tokenizer truncated that suffix, making distinct anchors identical for many parameters.
Equal scores then passed through `argmax`, whose first-index tie break selected the minimum/first option.
Range anchors now put their varying level and meaning first; Select/Toggle prompts put the option/state first.
Near-tie Range scores use a weighted neutral estimate instead of silently choosing the minimum.
Ambiguous Select/Toggle results retain the V3 default and report why; missing Range anchors do likewise.
Audio-to-Parameter and AM-Stage both use the same segment-result application helper and SigLIP endpoint.
A real `SPEZ.mp3` segment produced varied low, middle, and high Range values after the prompt fix.
The returned suggested/current values are applied together by the shared helper for bank and timeline state.
