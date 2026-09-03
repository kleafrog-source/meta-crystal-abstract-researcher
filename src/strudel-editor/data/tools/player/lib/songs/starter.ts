/**
 * Default code for a brand-new song. Two constraints shape every line:
 *
 * 1. Arrangement — each voice is the timeline's recognizable pickRestart
 *    idiom, all spanning the same 40 cycles, so the strip's editing
 *    affordances light up on first load. `~` slots keep a voice out of a
 *    section; repeated tokens (the keys' `pads`) share one variant.
 * 2. Granular editing — every variant's head string stays inside the strict
 *    editable subset (lib/notation/parse.ts): flat steps, `[a,b]` chords,
 *    `@n` elongation, and `<bar bar ...>` alternations. Multi-bar harmony is
 *    a `<...>` with one slot per bar, which the grid and roll edit natively.
 *
 * The arc is a small pop form over Am–F–C–G (one chord per bar): keys alone
 * for the intro, the verse brings in a backbeat and a tresillo bass, the
 * chorus goes four-on-the-floor with open hats, a pumping bass, and a lead
 * hook that only ever shows up there — and the outro ends where we began.
 */
export const STARTER_CODE = `// drums — backbeat verses, four-on-the-floor choruses
drums: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: s("bd ~ sd ~ bd bd sd ~").bank("RolandTR909"),
  chorus: s("bd ~ [bd,sd] ~ bd ~ [bd,sd] ~").bank("RolandTR909"),
})

// hats — closed eighths in the verse, open offbeats in the chorus
hats: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: s("hh hh hh hh hh hh hh hh").bank("RolandTR909").gain(0.4),
  chorus: s("~ oh ~ oh ~ oh ~ oh").bank("RolandTR909").gain(0.5),
})

// bass — tresillo roots down Am F C G, pumping quarters in the chorus
bass: "<~@4 verse@8 chorus@8 verse@8 chorus@8 ~@4>".pickRestart({
  verse: note("<[a1 ~ ~ a1 ~ ~ a1 ~] [f1 ~ ~ f1 ~ ~ f1 ~] [c2 ~ ~ c2 ~ ~ c2 ~] [g1 ~ ~ g1 ~ ~ g1 ~]>").s("sawtooth").lpf(500),
  chorus: note("<[a1 a1 a1 a1] [f1 f1 f1 f1] [c2 c2 c2 c2] [g1 g1 g1 g1]>").s("sawtooth").lpf(700),
})

// keys — one chord per bar; the outro ends where we began
keys: "<pads@12 chorus@8 pads@8 chorus@8 pads@4>".pickRestart({
  pads: note("<[a3,c4,e4] [a3,c4,f4] [g3,c4,e4] [g3,b3,d4]>").piano().room(0.6),
  chorus: note("<[a3,c4,e4,a4] [a3,c4,f4,a4] [g3,c4,e4,g4] [g3,b3,d4,g4]>").piano().room(0.4),
})

// lead — a four-bar hook, saved for the chorus
lead: "<~@4 ~@8 chorus@8 ~@8 chorus@8 ~@4>".pickRestart({
  chorus: note("<[e5 ~ ~ d5 c5 ~ d5 ~] [c5 ~ a4 ~ ~ ~ ~ ~] [e5 ~ ~ d5 c5 ~ d5 ~] [d5 ~ b4 ~ g4 ~ ~ ~]>").piano().room(0.5),
})
`;
