import { CategoryDef, MMSSParameter, PsyVibePreset } from './types';

export const PSY_VIBES_PRESETS: PsyVibePreset[] = [
  {
    id: 'krodha_acid_mud',
    name: 'Krodha 303 Acid Mud Squelch',
    rasa: 'Krodha (Fury / Intensity)',
    description: 'Sticky mud 303 resonance swirl, rubbery dough sound FX, 154 BPM four-on-the-floor drive.',
    targetBpm: 154,
    embeddingVectorSim: 0.984,
    suggestedTags: ['303', 'squelch', 'sticky_mud', 'acid', 'resonance'],
    paramOverrides: {
      tempo_bpm: 154,
      acid_squelch_type: 'sticky_mud_boot',
      microtonal_sruti_drift: 0.75,
      reverb_decay_s: 12.0
    }
  },
  {
    id: 'vira_rolling_bass',
    name: 'Vira Rolling Bass 150BPM',
    rasa: 'Vira (Heroic Drive)',
    description: 'Mono 25-60Hz sub, 16th rolling offbeat bass, tight sidechain compression, 2.5-8kHz presence attack.',
    targetBpm: 150,
    embeddingVectorSim: 0.962,
    suggestedTags: ['rolling_bass', 'sub_25_60hz', 'drive', 'goa_groove'],
    paramOverrides: {
      tempo_bpm: 150,
      sub_freq_mono_cutoff: 60,
      acid_squelch_type: 'rubber_dough',
      reverb_decay_s: 8.5
    }
  },
  {
    id: 'shanta_cosmic_temple',
    name: 'Shanta Cosmic Temple Reverb (30s Decay)',
    rasa: 'Shanta (Tranquility / Cosmic Void)',
    description: 'Temple Haveli IR, wet 85%, 30s decay tail, Om/Akash phonetic whisper echoes, narrow-band Q=6 focus.',
    targetBpm: 142,
    embeddingVectorSim: 0.975,
    suggestedTags: ['temple_ir', 'cosmic_reverb', 'om_phonetic', 'narrow_q6'],
    paramOverrides: {
      tempo_bpm: 142,
      reverb_decay_s: 30.0,
      temple_ir_wet_ratio: 85,
      traditional_anchor_phoneme: 'Om'
    }
  },
  {
    id: 'tandava_polymetric_superposition',
    name: 'Tandava Poly-metric Superposition',
    rasa: 'Raudra / Tandava (Cosmic Destruction)',
    description: '16th/32nd arpeggios, FM detuned leads, granular particle fly-bys, 22-Śruti microtonal drift.',
    targetBpm: 165,
    embeddingVectorSim: 0.951,
    suggestedTags: ['polymetric', 'arpeggio', 'fm_lead', '22_sruti'],
    paramOverrides: {
      tempo_bpm: 165,
      sruti_field_tuning: '22_sruti_deval',
      microtonal_sruti_drift: 1.25,
      reverb_decay_s: 15.0
    }
  }
];

export const CATEGORIES: CategoryDef[] = [
  { id: 'acid_goa', name: '1. GOA ACID & TEMPO', symbol: '🌀', description: '140-168 BPM Goa Trance Breath-Arc & 303 Mud Squelch' },
  { id: 'microtonal', name: '2. 22-ŚRUTI FIELD', symbol: '☸', description: 'Bhatkhande/Deval microtonal drift & Equal temperament ban' },
  { id: 'metacrystal', name: '3. META-CRYSTAL PARSER', symbol: '🔮', description: 'Semantic focus word, elements[] convolution & QEC/CHSH metrics' },
  { id: 'r_logic', name: '4. R-LOGIC & API-BYPASS', symbol: '∞', description: 'Recursion Depth (R=0..7), Input Hash Seed & Fail-Safe Bypass' },
  { id: 'lfe_voice', name: '5. VOICE & TIHAĪ DRAMA', symbol: '🗣', description: 'Phonetic Tihaī drama peaks [word, Δt, word] & Om/Akash anchors' },
  { id: 'axioms', name: '6. AXIOMS (A1-A5)', symbol: '⊤', description: 'Monotonic Path, Zero Flux & Recur Closure' },
  { id: 'quantum', name: '7. OPERATORS Ω', symbol: 'Ψ', description: 'Operators [∂₀,≈,↑⃗,⇄,⊗,↓,∞] & ⊕, →, ↔, ⊗' },
  { id: 'metrics', name: '8. STABILITY CORE', symbol: 'Δ', description: 'Distance metric D < 0.05, D_f 91.5, R_T 2.618' },
  { id: 'spatial', name: '9. TEMPLE ATMOSPHERE', symbol: '🏛', description: 'Temple Haveli IR, 30s Decay & Viscous Fluid' },
];

export const MMSS_PARAMETERS: MMSSParameter[] = [
  // --- GOA ACID & TEMPO (1-12) ---
  {
    id: 'tempo_bpm',
    label: 'Goa Trance Breath-Arc Tempo (BPM)',
    type: 'range',
    category: 'acid_goa',
    description: 'Target tempo range for hypnotizing four-on-the-floor Goa drive (140-168 BPM).',
    mmssMapping: 'Acoustic Mapping | Tempo 140-168 BPM',
    defaultValue: 152,
    min: 136,
    max: 178,
    step: 1,
    unit: 'BPM',
    tags: ['goa', 'trance', 'tempo', 'bpm', '152bpm']
  },
  {
    id: 'acid_squelch_type',
    label: '303 Acid-Cell Squelch Timbre',
    type: 'select',
    category: 'acid_goa',
    description: 'Resonant LPASS sound pattern texture automation.',
    mmssMapping: 'Layer Architecture | Acid priority 2 303 squelch',
    defaultValue: 'sticky_mud_boot',
    options: [
      { label: 'Boot Squelching in Deep Sticky Mud', value: 'sticky_mud_boot' },
      { label: 'Rubbery Wet Dough Sound FX', value: 'rubber_dough' },
      { label: 'Resonant Saw Swirl Glide', value: 'resonant_saw_swirl' },
      { label: 'FM Liquid Acid Envelope', value: 'fm_liquid_envelope' }
    ],
    tags: ['303', 'acid', 'squelch', 'sticky_mud', 'dough']
  },
  {
    id: 'sub_freq_mono_cutoff',
    label: 'Mono Sub Bass Frequency Cutoff (25-60Hz)',
    type: 'number',
    category: 'acid_goa',
    description: 'Mono low-end sub foundation cutoff frequency to keep sub tight below rolling bass.',
    mmssMapping: 'Acoustic Mapping | sub 25-60Hz mono',
    defaultValue: 50,
    min: 25,
    max: 80,
    step: 1,
    unit: 'Hz',
    tags: ['sub', 'mono', 'bass', '25hz', '60hz']
  },
  {
    id: 'rolling_bass_sidechain',
    label: 'Rolling Offbeat Bass Sidechain Pumping',
    type: 'range',
    category: 'acid_goa',
    description: 'Sidechain ducking ratio on offbeat rolling bassline.',
    mmssMapping: 'Layer 1 Drive | Rolling offbeat bass mono <200Hz',
    defaultValue: 0.85,
    min: 0.2,
    max: 1.0,
    step: 0.05,
    unit: 'ratio',
    tags: ['rolling_bass', 'sidechain', 'offbeat', 'pumping']
  },
  {
    id: 'seq_arpeggio_speed',
    label: '16th/32nd Sequence Arpeggio Speed',
    type: 'radio',
    category: 'acid_goa',
    description: 'Arpeggio resolution for psychedelic sequence layer.',
    mmssMapping: 'Layer 3 Sequence | 16th/32nd arpeggios',
    defaultValue: '16th_32nd_triplets',
    options: [
      { label: '16th Rolling Note Arpeggios', value: '16th_rolling' },
      { label: '16th / 32nd Triplets Superposition', value: '16th_32nd_triplets' },
      { label: '32nd Fast Acid Sequences', value: '32nd_fast' }
    ],
    tags: ['arpeggio', 'sequence', '16th', '32nd']
  },
  {
    id: 'lead_detuned_saw_fm',
    label: 'Detuned Saw & FM Lead Layering',
    type: 'toggle',
    category: 'acid_goa',
    description: 'Enables detuned saw/FM leads with gated pads and counter-lines.',
    mmssMapping: 'Layer 4 Lead | Detuned saw/FM leads',
    defaultValue: true,
    tags: ['lead', 'fm', 'saw', 'detuned']
  },
  {
    id: 'fx_granulation_stereo_flyby',
    label: 'FX Granular Particles & Stereo Fly-Bys',
    type: 'range',
    category: 'acid_goa',
    description: 'High-frequency conversion into swirling sub-effect bursts & stereo fly-bys.',
    mmssMapping: 'Layer 5 FX | Granular particles & stereo fly-bys',
    defaultValue: 0.78,
    min: 0.1,
    max: 1.0,
    step: 0.02,
    unit: 'density',
    tags: ['fx', 'granular', 'flyby', 'stereo']
  },
  {
    id: 'kick_attack_smoothing',
    label: 'First Kick Transient Attack Smoothing (≤10ms)',
    type: 'number',
    category: 'acid_goa',
    description: 'Smoothed initial kick transient to avoid harsh click impact.',
    mmssMapping: 'Phase 1 ∂₀_Init | first kick transient ≤10ms',
    defaultValue: 8.5,
    min: 1.0,
    max: 15.0,
    step: 0.5,
    unit: 'ms',
    tags: ['kick', 'transient', 'attack', 'smoothed']
  },
  {
    id: 'cutoff_resonance_automation',
    label: 'Cutoff & Resonance Swirl Automation',
    type: 'range',
    category: 'acid_goa',
    description: 'Rate of 303 lowpass filter cutoff and resonance modulation swirl.',
    mmssMapping: 'Layer 2 Acid | Cutoff/resonance swirl',
    defaultValue: 0.92,
    min: 0.1,
    max: 1.0,
    step: 0.01,
    unit: 'swirl',
    tags: ['cutoff', 'resonance', 'automation', 'swirl']
  },
  {
    id: 'presence_air_band_boost',
    label: 'Presence (2.5-8kHz) & Air (8-16kHz) Shimmer',
    type: 'range',
    category: 'acid_goa',
    description: 'High-frequency presence attack and air shimmer balance.',
    mmssMapping: 'Frequency Bands | Presence 2.5-8kHz & Air 8-16kHz',
    defaultValue: 0.65,
    min: 0.1,
    max: 1.0,
    step: 0.05,
    unit: 'shimmer',
    tags: ['presence', 'air', 'shimmer', 'highs']
  },
  {
    id: 'four_on_floor_groove_strictness',
    label: 'Steady Four-on-the-Floor Goa Pulse',
    type: 'toggle',
    category: 'acid_goa',
    description: 'Maintains steady 4/4 kick engine underlying dynamic acid evolution.',
    mmssMapping: 'Acoustic Mapping | steady four-on-the-floor',
    defaultValue: true,
    tags: ['kick', 'four_on_floor', 'groove']
  },
  {
    id: 'mode_toggle_bidirectional_delay',
    label: 'Mode Toggle (Bass ↔ Acid ↔ Lead ↔ FX)',
    type: 'radio',
    category: 'acid_goa',
    description: 'Bidirectional mode toggle across sound layers during ⇄_Commute phase.',
    mmssMapping: 'Phase 4 ⇄_Commute | Bass↔Acid↔Lead↔FX',
    defaultValue: 'acid_lead_commute',
    options: [
      { label: 'Acid ↔ Lead Bi-directional Toggle', value: 'acid_lead_commute' },
      { label: 'Bass ↔ FX Dynamic Shift', value: 'bass_fx_shift' },
      { label: 'Full 4-Way Pole Mutation', value: 'full_4way_mutation' }
    ],
    tags: ['commute', 'toggle', 'acid', 'lead']
  },

  // --- 22-ŚRUTI MICROTONAL FIELD (13-24) ---
  {
    id: 'sruti_field_tuning',
    label: '22-Śruti Microtonal Field Mapping System',
    type: 'select',
    category: 'microtonal',
    description: 'Strict Indian classical 22-Śruti microtonal tuning (Bhatkhande/Deval ratios). Equal temperament forbidden.',
    mmssMapping: 'Microtonal Integrity | 22-Śruti Field (Bhatkhande/Deval)',
    defaultValue: '22_sruti_deval',
    options: [
      { label: '22-Śruti Deval Harmonic Ratios', value: '22_sruti_deval' },
      { label: '22-Śruti Bhatkhande Consonance System', value: '22_sruti_bhatkhande' },
      { label: 'Custom Microtonal Meend Shift', value: 'custom_meend' }
    ],
    tags: ['22_sruti', 'microtonal', 'bhatkhande', 'deval', 'tuning']
  },
  {
    id: 'microtonal_sruti_drift',
    label: 'Microtonal Pitch Drift Range (±Śruti)',
    type: 'range',
    category: 'microtonal',
    description: 'Permitted microtonal drift range (±0.25 to ±1.5 śruti).',
    mmssMapping: 'Microtonal Integrity | Microtonal drift ±0.25-1.5 śruti',
    defaultValue: 0.75,
    min: 0.25,
    max: 1.50,
    step: 0.05,
    unit: 'śruti',
    tags: ['drift', 'microtonal', 'sruti', 'pitch']
  },
  {
    id: 'forbid_equal_temperament',
    label: 'Forbid Equal Temperament (12-TET Ban)',
    type: 'toggle',
    category: 'microtonal',
    description: 'Strictly bans 12-TET Western equal temperament tuning.',
    mmssMapping: 'Microtonal Integrity | Equal temperament forbidden',
    defaultValue: true,
    tags: ['forbidden', '12tet', 'equal_temperament']
  },
  {
    id: 'autocorrect_sruti_tolerance',
    label: 'Auto-Correct Śruti Tolerance Window',
    type: 'number',
    category: 'microtonal',
    description: 'Automatic correction threshold if drift exceeds tolerance (±0.3 śruti).',
    mmssMapping: 'Microtonal Integrity | Auto-correct ±0.3 śruti',
    defaultValue: 0.30,
    min: 0.10,
    max: 0.50,
    step: 0.01,
    unit: 'śruti',
    tags: ['autocorrect', 'tolerance', 'sruti']
  },

  // --- META-CRYSTAL PARSER (25-36) ---
  {
    id: 'metacrystal_semantic_anchor',
    label: 'Meta-Crystal Focus Word Semantic Anchor',
    type: 'toggle',
    category: 'metacrystal',
    description: 'Parses focus.word as central semantic anchor for track synthesis.',
    mmssMapping: 'Meta-Crystal Parsing | focus.word -> semantic anchor',
    defaultValue: true,
    tags: ['metacrystal', 'focus', 'anchor', 'semantic']
  },
  {
    id: 'metacrystal_convolution_pool',
    label: 'Elements[] Domain Pool for ⊗ Convolution',
    type: 'select',
    category: 'metacrystal',
    description: 'Maps elements[] list from meta-crystal into domain pool for layering.',
    mmssMapping: 'Meta-Crystal Parsing | elements[] -> domain pool',
    defaultValue: 'elements_all',
    options: [
      { label: 'Full Elements Array Convolution', value: 'elements_all' },
      { label: 'Filtered Primary Elements Only', value: 'elements_primary' },
      { label: 'Abstract Symbolic Projection', value: 'elements_abstract' }
    ],
    tags: ['metacrystal', 'elements', 'convolution', 'pool']
  },
  {
    id: 'metacrystal_name_safety',
    label: 'Name-Safety Concept Parser',
    type: 'toggle',
    category: 'metacrystal',
    description: 'Treats scientific, mathematical, and philosophical terms exclusively as abstract concepts.',
    mmssMapping: 'Meta-Crystal Parsing | NAME-SAFETY parser',
    defaultValue: true,
    tags: ['namesafety', 'abstract', 'concepts']
  },

  // --- R-LOGIC & API-BYPASS (37-48) ---
  {
    id: 'r_recursion_depth',
    label: 'Recursion Evolutionary Depth (R)',
    type: 'range',
    category: 'r_logic',
    description: 'Evolutionary stage for new standalone track generation (R=0 to R=7).',
    mmssMapping: 'R-Logic | Recursion Depth R (0 to 7)',
    defaultValue: 0,
    min: 0,
    max: 7,
    step: 1,
    unit: 'R',
    tags: ['r_logic', 'recursion', 'depth', 'r7']
  },
  {
    id: 'r_auto_seed_hash',
    label: 'Input Hash Auto-Seed Derivation',
    type: 'toggle',
    category: 'r_logic',
    description: 'Auto-derives seed from hash of prompt / crystal input.',
    mmssMapping: 'R-Logic | Seed auto-derived from input hash',
    defaultValue: true,
    tags: ['seed', 'hash', 'autoderived']
  },
  {
    id: 'r7_api_bypass_mode',
    label: 'R=7 API-Bypass Auto-Simplifier',
    type: 'toggle',
    category: 'r_logic',
    description: 'On validation block at R=7, auto-simplifies sound_prompt to "ambient drone, reverb, 147bpm, ⇄ R=6.9" with decay ≤10s to pass schema.',
    mmssMapping: 'Critical Constraints | R=7 API-BYPASS',
    defaultValue: true,
    tags: ['r7', 'apibypass', 'simplifier', 'drone']
  },

  // --- VOICE & TIHAĪ DRAMA (49-60) ---
  {
    id: 'lfe_tihai_drama_peak',
    label: 'Tihaī Drama Peak Pattern [word, Δt, word]',
    type: 'toggle',
    category: 'lfe_voice',
    description: 'Inserts classical Indian Tihaī rhythmic silence pauses during voice drama peaks.',
    mmssMapping: 'LFE Formulas | IF drama_peak THEN [word, silence_Δt, word]',
    defaultValue: true,
    tags: ['tihai', 'drama', 'silence', 'voice']
  },
  {
    id: 'lfe_traditional_phoneme_anchor',
    label: 'Traditional Phoneme Anchor (Om / Akash / Nada)',
    type: 'select',
    category: 'lfe_voice',
    description: 'Grounding phonetic syllable for voice FX layer.',
    mmssMapping: 'LFE Constraints | MIN 1 traditional_anchor phoneme',
    defaultValue: 'Om',
    options: [
      { label: 'Om (Cosmic Vibration)', value: 'Om' },
      { label: 'Akash (Ether/Space)', value: 'Akash' },
      { label: 'Nada (Inner Sound)', value: 'Nada' },
      { label: 'Synthetic Alien Syllable', value: 'Synthetic_Alien' }
    ],
    tags: ['phoneme', 'om', 'akash', 'nada', 'anchor']
  },

  // --- AXIOMS (A1-A5) (61-72) ---
  {
    id: 'ax_strong_reset',
    label: 'STRONG_RESET_INDEPENDENCE',
    type: 'toggle',
    category: 'axioms',
    description: 'Forces zero state inheritance between JSON requests. Each session is a new universe.',
    mmssMapping: 'L1 OMNI_CONTRACT | ∅ inheritance',
    defaultValue: true,
    tags: ['reset', 'universe', 'state', 'independence']
  },
  {
    id: 'ax_monotonic_path',
    label: 'A1 Monotonic Path Enforcement',
    type: 'toggle',
    category: 'axioms',
    description: 'Strict 7-phase transition flow without backward state rollbacks (φₙ → φₙ₊₁).',
    mmssMapping: 'A1_MonotonicPath | ⊤ Monotonicity',
    defaultValue: true,
    tags: ['phases', 'flow', 'monotonic', 'strict']
  },
  {
    id: 'ax_zero_flux',
    label: 'A2 Zero Flux Delta Sum',
    type: 'number',
    category: 'axioms',
    description: 'Target sum of param variations across cycle: ΣΔ(param) = 0.',
    mmssMapping: 'A2_ZeroFlux | ΣΔ(param)=0',
    defaultValue: 0.00,
    min: -0.1,
    max: 0.1,
    step: 0.001,
    unit: 'Δ',
    tags: ['flux', 'conservation', 'zero', 'delta']
  },
  {
    id: 'ax_recur_closure',
    label: 'A3 Terminal Closure Inclusion',
    type: 'range',
    category: 'axioms',
    description: 'Degree to which terminal state x7 is nested within initial impulse x0.',
    mmssMapping: 'A3_RecurClose | State7 ⊂ State0',
    defaultValue: 0.95,
    min: 0,
    max: 1,
    step: 0.01,
    unit: 'ratio',
    tags: ['closure', 'recursion', 'terminal', 'loop']
  },
  {
    id: 'ax_operator_isomorphism',
    label: 'A4 Operator Semantic Isomorphism',
    type: 'radio',
    category: 'axioms',
    description: 'Maintains structural invariant Ω(P₁) ≅ Ω(P₂) across arbitrary audio domains.',
    mmssMapping: 'A4_OpIsomorph | Ω Semantics',
    defaultValue: 'strict',
    options: [
      { label: 'Strict Invariant (1.0)', value: 'strict' },
      { label: 'Adaptive Scale (0.8)', value: 'adaptive' },
      { label: 'Fluid Metamorphism (0.5)', value: 'fluid' }
    ],
    tags: ['isomorphism', 'semantics', 'structure']
  },
  {
    id: 'ax_adapt_density_lambda',
    label: 'A5 Adaptive Transition Noise Decay (λ)',
    type: 'range',
    category: 'axioms',
    description: 'Density function exponent λ in ρₙ = exp(-λ · σₙ²). Smooths transitions under high noise.',
    mmssMapping: 'A5_AdaptDensity | λ parameter',
    defaultValue: 0.85,
    min: 0.1,
    max: 2.0,
    step: 0.05,
    unit: 'λ',
    tags: ['noise', 'decay', 'density', 'smooth']
  },

  // --- OPERATORS Ω (73-84) ---
  {
    id: 'q_equation_expr',
    label: 'Core Fixed Point Recursion Y(λΨ...)',
    type: 'toggle',
    category: 'quantum',
    description: 'Enables Y combinator fixpoint recursion over Ψ(G), Ψ(Q), and Ψ(Φ) operator chains.',
    mmssMapping: 'Ядро | Y(λΨ.λx.META_G_Ψ)',
    defaultValue: true,
    tags: ['recursion', 'fixpoint', 'combinator', 'operators']
  },
  {
    id: 'q_crossfade_operator',
    label: 'Linear/Sigmoid Crossfade Operator (⊕)',
    type: 'radio',
    category: 'quantum',
    description: 'Blending curve used when executing the ⊕ state composition operator.',
    mmssMapping: 'Operators | ⊕ Crossfade',
    defaultValue: 'sigmoid',
    options: [
      { label: 'Sigmoid Smooth Transition', value: 'sigmoid' },
      { label: 'Linear Constant Slope', value: 'linear' },
      { label: 'Exponential Sharp Edge', value: 'exponential' }
    ],
    tags: ['crossfade', 'operator', 'sigmoid']
  },
  {
    id: 'q_convolution_mode',
    label: 'Texture Layering Convolution (⊗)',
    type: 'select',
    category: 'quantum',
    description: 'Mathematical mode for spectral convolution ⊗ between layers.',
    mmssMapping: 'Operators | ⊗ Convolve',
    defaultValue: 'spectral_multiplicative',
    options: [
      { label: 'Spectral Multiplicative', value: 'spectral_multiplicative' },
      { label: 'Hilbert Phase Inversion', value: 'hilbert_phase' },
      { label: 'Granular Stacking', value: 'granular_stacking' }
    ],
    tags: ['convolution', 'layering', 'spectral']
  },

  // --- STABILITY CORE (85-94) ---
  {
    id: 'mt_metric_d_threshold',
    label: 'D_metric Instability Threshold',
    type: 'number',
    category: 'metrics',
    description: 'Maximum permitted distance error metric D before triggering stability failure.',
    mmssMapping: 'Metrics | D < 0.05',
    defaultValue: 0.042,
    min: 0.001,
    max: 0.100,
    step: 0.001,
    unit: 'D',
    tags: ['metric', 'instability', 'threshold', 'distance']
  },
  {
    id: 'mt_fractal_dimension_df',
    label: 'D_f (Fractal Multi-Layer Dimension)',
    type: 'range',
    category: 'metrics',
    description: 'Fractal dimension depth parameter across multi-layer structure.',
    mmssMapping: 'Metrics | D_f -> 91.5',
    defaultValue: 91.5,
    min: 1.0,
    max: 100.0,
    step: 0.5,
    unit: 'D_f',
    tags: ['fractal', 'dimension', 'depth']
  },
  {
    id: 'mt_golden_ratio_rt',
    label: 'R_T Golden Ratio Phase Transition Value',
    type: 'number',
    category: 'metrics',
    description: 'Golden ratio scaling exponent for phase boundaries (Fixed MMSS constant = 2.618).',
    mmssMapping: 'Metrics | R_T -> 2.618',
    defaultValue: 2.618,
    min: 1.000,
    max: 4.000,
    step: 0.001,
    unit: 'R_T',
    tags: ['golden', 'ratio', 'phase']
  },

  // --- TEMPLE ATMOSPHERE (95-104) ---
  {
    id: 'sp_temple_ir_reverb',
    label: 'Temple Haveli IR Reverb Environment',
    type: 'select',
    category: 'spatial',
    description: 'Ancient Temple Haveli IR impulse response with 5-30s wet decay tails.',
    mmssMapping: 'Atmosphere | Temple/Haveli IR wet 45-95%',
    defaultValue: 'temple_haveli_30s',
    options: [
      { label: 'Temple Haveli IR (30s Cosmic Decay)', value: 'temple_haveli_30s' },
      { label: 'Vedic Cave Resonance (15s Decay)', value: 'vedic_cave_15s' },
      { label: 'Cosmic Anchoic Void', value: 'anchoic_void' }
    ],
    tags: ['temple', 'reverb', 'haveli', 'ir']
  },
  {
    id: 'sp_reverb_wet_ratio',
    label: 'Reverb Wet Ratio Percentage (45-95%)',
    type: 'range',
    category: 'spatial',
    description: 'Wet reverb mix ratio for temple ambience.',
    mmssMapping: 'Atmosphere | wet 45-95%',
    defaultValue: 75,
    min: 45,
    max: 95,
    step: 1,
    unit: '%',
    tags: ['wet', 'reverb', 'ratio']
  }
];
