# Strudel Quality Roadmap

## Context

Current `Strudel Lab` state confirms the concept is technically viable:

- semantic retrieval over a large Strudel corpus works;
- `bge-m3` / Ollama-backed search works;
- code assembly from retrieved material works;
- UI flow for query -> select -> build -> play works.

But the current output quality is still low.

Practical assessment:

- current average quality: about `4-6 / 20`;
- best occasional result: still below a convincing “real track”;
- main failure is not indexing volume, but weak musical intermediate representation and weak assembly logic.

This document defines two concrete paths:

1. minimally viable path to about `10 / 20`;
2. realistic path to about `14-16 / 20`.

---

## Diagnosis

The current system underperforms for structural reasons:

- retrieval mostly returns useful fragments, not complete compatible musical building blocks;
- assembly still relies on templates that are too shallow;
- harmony, rhythm, phrasing, and instrumentation are not normalized strongly enough after retrieval;
- section planning exists only in a limited heuristic form;
- there is no candidate search + rerank loop at the track level;
- there is no strong post-assembly critic/repair pass.

As a result, the system produces:

- plausible syntax;
- sometimes plausible local gestures;
- weak global musical coherence.

---

# Path A: Minimally Viable Route To `10 / 20`

## Goal

Reach a level where generated output is still clearly machine-assembled, but:

- sounds like a coherent loop or draft track;
- respects the query style more often;
- has stable roles: drums, bass, harmony, lead, texture;
- has section contrast that is audible;
- avoids obvious nonsense layer combinations.

This is the shortest practical path worth implementing before deeper architecture work.

## Expected Result

At `10 / 20`, outputs should:

- sound like a usable sketch;
- reflect requested style in a recognizable way;
- avoid major role mistakes;
- have consistent key/scale and better rhythmic fit;
- feel repetitive, but not broken.

---

## A1. Replace “param-first” assembly with “role-block” assembly

### Problem

Current flow still overweights abstract parameters and small fragments.

### Needed change

Make the core unit of generation:

- drum block
- bass block
- harmony block
- lead block
- texture block

Each block should be represented as:

- a normalized symbolic snippet;
- role label;
- style tags;
- bar length;
- tonal compatibility metadata;
- density/intensity metadata.

### Deliverable

A small curated derived dataset:

- `drum_blocks.jsonl`
- `bass_blocks.jsonl`
- `harmony_blocks.jsonl`
- `lead_blocks.jsonl`
- `texture_blocks.jsonl`

### Why this helps

This immediately reduces bad “semantic but musically useless” assembly.

---

## A2. Build a simple but strict track plan before retrieval

### Problem

The query currently influences selection, but not through a rigid enough musical plan.

### Needed change

Introduce a deterministic planning stage that outputs:

- style family
- BPM range
- scale/mode
- section form
- required roles
- energy curve
- density target

Example:

```json
{
  "style": "retro",
  "bpm": 148,
  "scale": "D dorian",
  "sections": ["intro", "main", "variation", "break", "return"],
  "required_roles": ["drums", "bass", "lead", "harmony"],
  "energy_curve": [0.35, 0.8, 0.9, 0.45, 0.95]
}
```

### Deliverable

A `track_plan` object generated before any final assembly.

### Why this helps

It constrains retrieval and reduces random patchwork.

---

## A3. Enforce compatibility filters after retrieval

### Problem

Even relevant retrieved blocks often do not belong together.

### Needed change

After selecting candidate role blocks, reject combinations that violate:

- incompatible bar lengths;
- incompatible tonal mode;
- extreme density mismatch;
- weak drum/bass pairing;
- weak bass/harmony pairing;
- weak lead/style pairing.

### Deliverable

A compatibility scorer and hard rejection rules.

### Why this helps

This is one of the fastest ways to raise quality without redesigning everything.

---

## A4. Generate 8-16 candidates, not one

### Problem

One-shot assembly is too brittle.

### Needed change

For each query:

1. retrieve candidates per role;
2. assemble 8-16 track candidates;
3. score them;
4. keep top 1-3.

### Candidate score should include

- style match;
- role coverage;
- harmonic consistency;
- rhythmic consistency;
- section contrast;
- repetition penalty;
- unresolved source penalty.

### Deliverable

A batch candidate generator and reranker.

### Why this helps

This alone can materially improve quality without using an LLM as a composer.

---

## A5. Add a post-assembly repair pass

### Problem

Even a good candidate often has one or two obvious defects.

### Needed change

Repair pass should:

- normalize key/scale;
- align phrase lengths;
- simplify lead if too long/noisy;
- simplify harmony if too dense;
- reduce drum layer if it feels incoherent;
- force more obvious breakdown contrast.

### Deliverable

A deterministic `repair_track()` pass.

### Why this helps

It upgrades “almost usable” outputs into “usable draft” outputs.

---

## A6. Add human-useful output controls

### Needed UI additions

- “Generate 8 candidates”
- “Show candidate scores”
- “Repair selected candidate”
- “Favor coherence”
- “Favor experimentation”

### Why this helps

Even if quality is not yet high, user can steer generation meaningfully.

---

## Path A Milestones

### Milestone A1

- role-block dataset extracted
- planning stage implemented
- compatibility filters implemented

### Milestone A2

- batch candidate generation implemented
- top candidate reranking implemented
- repair pass implemented

### Milestone A3

- user can inspect 3-5 top candidates
- output reaches a repeatable `8-10 / 20`

---

## Path A Estimated Ceiling

If executed well, Path A can realistically reach:

- average: `8-10 / 20`
- occasional strong result: `11 / 20`

It will still feel template-driven and limited, but should stop feeling broken.

---

# Path B: Realistic Route To `14-16 / 20`

## Goal

Reach a level where outputs are no longer just “valid Strudel drafts”, but:

- musically coherent;
- stylistically recognizable;
- sectionally structured;
- internally varied;
- useful enough to keep, tweak, and build upon.

This requires architectural change, not polishing the current assembly alone.

## Expected Result

At `14-16 / 20`, outputs should:

- sound like believable track sketches;
- show strong style adherence;
- have meaningful form and energy progression;
- maintain coherent harmonic/rhythmic language;
- avoid obvious retrieval seams.

---

## B1. Build a multi-resolution music dataset

### Problem

The current dataset is too flat.

### Needed change

Extract and store multiple units from the corpus:

- track-level metadata
- section-level blocks
- drum grooves
- basslines
- chord progressions
- lead motifs
- transition fills
- effect/automation patterns

Each should have:

- role
- section label
- bars
- style family
- energy level
- density
- tonal center
- symbolic summary
- renderable Strudel form

### Deliverable

New datasets such as:

- `track_sections.jsonl`
- `grooves.jsonl`
- `basslines.jsonl`
- `progressions.jsonl`
- `motifs.jsonl`
- `transitions.jsonl`

### Why this helps

This is the real foundation for better composition quality.

---

## B2. Introduce a real track planner

### Problem

Current planning is heuristic and shallow.

### Needed change

Planner should explicitly produce:

- target style
- BPM
- meter/cycle assumptions
- tonal plan
- section map
- instrumentation plan
- energy progression
- variation strategy
- transition strategy

### Deliverable

A formal `TrackPlan` schema with validation.

### Why this helps

The whole system becomes composition-first instead of fragment-first.

---

## B3. Candidate assembly at the section level

### Problem

Current system assembles a track too directly from local fragments.

### Needed change

For each section in the plan:

1. retrieve multiple compatible drum candidates;
2. retrieve multiple compatible bass candidates;
3. retrieve multiple compatible harmony candidates;
4. retrieve multiple compatible lead candidates;
5. combine into section candidates;
6. score section candidates;
7. keep best few per section.

Then assemble full tracks from section candidates.

### Deliverable

A hierarchical generator:

- section generation
- track generation from sections

### Why this helps

This is where quality can jump materially.

---

## B4. Add a critic and rerank layer

### Problem

Raw generation quality will remain uneven.

### Needed change

Introduce a critic layer that scores finished candidates.

Critic dimensions:

- style adherence
- role clarity
- harmony coherence
- rhythmic coherence
- section contrast
- variation quality
- transition quality
- track plausibility

### Implementation options

- heuristic symbolic critic
- embedding/audio critic
- LLM critic
- best option: hybrid critic

### Deliverable

A multi-signal scorer for reranking top candidates.

---

## B5. Add an audio-aware evaluation loop

### Problem

Symbolically valid code can still sound bad.

### Needed change

Render quick previews and analyze:

- energy contour
- onset density
- spectral balance
- section contrast
- repetitiveness
- dead sections

### Deliverable

A preview-eval loop over rendered audio snippets.

### Why this helps

This is one of the few ways to cross the boundary from “valid code” to “actual music”.

---

## B6. Add controlled mutation operators

### Problem

Straight retrieval + assembly produces overly literal reuse.

### Needed change

Add mutation operators for:

- rhythm variation
- motif variation
- chord substitution
- bass simplification/intensification
- transition insertion
- automation shaping

These should operate on symbolic material, not random text edits.

### Deliverable

A library of safe musical transforms.

### Why this helps

This makes the system compositional rather than collage-like.

---

## B7. Use LLM only where it is strongest

### Recommended LLM roles

- query interpretation
- planning
- critic feedback
- repair suggestion
- explanation / user-facing analysis

### Avoid

Do not ask the LLM to directly invent the whole musical code from scratch as the main method.

### Why this helps

LLM works well as planner/critic, poorly as raw symbolic composer without stronger scaffolding.

---

## B8. Add explicit quality evaluation datasets

### Needed change

Create benchmark queries and reference expectations:

- retro chip lead track
- ambient drone track
- industrial techno sketch
- IDM/glitch rhythmic sketch
- dub-techno chord sketch

For each benchmark:

- expected roles
- expected tempo band
- expected energy shape
- expected texture profile

### Deliverable

A small internal eval suite for regression testing.

### Why this helps

Without this, quality improvements will remain subjective and unstable.

---

## Path B Milestones

### Milestone B1

- multi-resolution dataset built
- track planner implemented
- section-level retrieval implemented

### Milestone B2

- hierarchical candidate generation implemented
- section scoring and full-track reranking implemented

### Milestone B3

- critic layer added
- audio preview evaluation added
- safe mutation operators added

### Milestone B4

- benchmark suite in place
- repeatable average quality reaches `12-14 / 20`

### Milestone B5

- best candidates regularly reach `14-16 / 20`
- outputs become useful as real production drafts

---

## Path B Estimated Ceiling

If executed well, this path can realistically reach:

- average: `12-14 / 20`
- strong outputs: `14-16 / 20`

Going beyond that would likely require either:

- a much stronger symbolic composition engine;
- better audio feedback loops;
- or a hybrid human-in-the-loop workflow.

---

## Direct Recommendation

If time is limited:

- do **Path A** first;
- stop once output becomes a believable draft;
- then decide whether the system justifies **Path B**.

If the goal is genuine quality rather than proof-of-concept:

- do not keep polishing the current flat assembler;
- move directly toward **Path B** architecture.

---

## Practical Conclusion

The current project already proves:

- semantic retrieval works;
- corpus-based assembly works;
- Strudel code can be generated from query;
- the end-to-end workflow is real.

But it does **not** yet prove:

- robust music generation quality;
- strong style fidelity;
- convincing full-track structure.

To get there, the main work is no longer “better embeddings” or “more tracks”.

The main work is:

- better musical representation;
- better planning;
- better candidate generation;
- better reranking;
- better repair.

