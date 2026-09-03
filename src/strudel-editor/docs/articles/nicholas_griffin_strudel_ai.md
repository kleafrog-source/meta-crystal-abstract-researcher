# Creating Strudel Live Coding Patterns with AI

Tags: #ai #strudel #prompts

Some time ago I launched my own planning poker app called SprintJam that makes it easy for people to run sessions with their team from a collaborative app. It's pretty cool but it is missing one feature to have some shared tunes while you're waiting for people to vote and discuss.

While looking for some solutions, I came across a piece of JavaScript software called Strudel and now I have an AI app that can generate patterns with AI.

## What is Strudel?

Strudel is software for writing music dynamically in the browser. It's a port of an older language called Tidal Cycles to JavaScript and makes it easy to make music with code, in real time.

The best way to see it is in action, so here's a video:

## Why AI?"

One of the biggest problems with AI today is that a lot of the image, music and video generation tools are just creating copies of content that already exists from someone else, they're not really creating original content. I do have a problem with this as it is stealing from communities that don't make a whole lot of income from their craft.

With Strudel, we can potentially alleviate that problem by generating code from documentation, the AI is effectively creating its own music.

Of course, the training for these models does include knowledge from other sources and that has most likely helped it with it's theory on how to create these patterns, however, if we build a good enough prompt, we can effectively pick and choose between models that best fit with our alignment goals and build something cool.

Alongside that, I want something that's super dynamic for this solution in SprintJam, ideally the music generated would be able to reflect the current state of the session.

## Creating an AI service to build Strudel Patterns

I've been building my own [AI Platform](https://github.com/nicholasgriffintn/ai-platform) for some time now that has a lot of the boilerplate and functionality that we need already in place so a lot of the work here is mostly going to be around building out the prompt and UI.

I've also chosen to use my Dynamic Apps system which is a framework that I've built in the application for quickly spinning up AI apps that use the functionality around the app for CRUD operations, so we don't need to do anything there.

### Building the prompt

It was super tricky to get a prompt that would output decent music from a basic user message. Humans are pretty great at validating that the code they have generated actually works and its still far too common for AI to just make up stuff.

The first iterations of the prompt were quite prone to this, the AI would read the documentation that I provided to it and make up methods that simply didn't exist based on musical theory and terms.

I did eventually get something going that does consistently produce results that were playable in Strudel, you can [take a look at that here](https://github.com/nicholasgriffintn/ai-platform/blob/main/apps/api/src/lib/prompts/strudel.ts).

To start I provide the AI with an overview of who it is an the wider task I want it to complete:

```
You are an expert Strudel live-coding assistant and performing musician. The user's message will describe the desired music (style, mood, instruments, tempo, etc.). Your job is to answer with ONE Strudel expression that users can paste into the Strudel REPL and run immediately. Strudel basics - Strudel is a browser-based JavaScript live-coding environment for algorithmic music. - Patterns are functions of time in "cycles". One cycle is the basic unit; rhythm usually comes from pattern density (.fast/.slow, mini-notation * and /, Euclidean rhythms) rather than from changing global tempo. - Sound is created by: • sample patterns with s("bd sd hh") • pitched patterns with note("c4 e4 g4") or n("0 2 4").scale("C:minor").s("sawtooth") Your job - Given a request (plus optional style/tempo/complexity hints), output a single, self-contained Strudel snippet that a user can paste into the Strudel REPL and run immediately. - The result should sound like a coherent musical idea, not a random demo of features.
```

This sets out the basic fundamentals of what Strudel is (it deffo thinks of the food first) and what I expect of it given a user prompt.

Below that I added some bullet point instructions on the language that the AI needed to use for Strudel and general usage guidance for them.

I figured that would be enough initially but I quickly found that not to be the case, the output was often either broken or a bit too technical and not enough of a sound that I actually wanted to listen to, so I added the following to tackle that:

```
MUSICAL PRIORITIES - Groove first: make the rhythm feel intentional and playable. - Tonality: if the user does not ask for noise/atonal/experimental only, pick a key/scale and stick to it. - Structure: aim for short "phrases" and gentle variation over time (not static one-bar loops). - Clarity: a few strong, clear ideas are better than a wall of noise. GENERAL RULES - Output ONLY Strudel code. No markdown fences or prose outside of Strudel comments. - Prefer concise, idiomatic mini-notation and chained functions over verbose JS. - Use only functions and syntax that exist in Strudel's documented API. - Prefer a few strong musical ideas over noisy clutter. - Do NOT call .play() – the host environment will handle playback. - Never call global tempo setters such as setcps / setCps or similar in your answer. - Do not define helpers or globals (no const/let/var, no register(), no await). - If no style is specified, infer a plausible one from the description and stay consistent.
```

### Jamming with AI

Now that we had our system prompt, I could send it a prompt like this:

```
Generate Strudel code for a lo-fi chill beat that evokes a relaxed, late-night vibe. Tempo: 80–85 bpm Instruments: dusty drums, warm Rhodes chords, vinyl crackle, mellow bass, soft synth pad Mood: calm, nostalgic, and smooth — perfect for studying or unwinding Style: slightly swung rhythm, subtle sidechain-style compression feel Structure: 8-bar loop with gentle variation every 4 bars Add light filter automation or reverb swells for atmosphere, and include comments describing each layer.
```

And get an output that's actually somewhat listenable, uses some complex patterns and comments its thoughts ([REPL Link](https://strudel.cc/))

```javascript
// Lo-fi chill beat with dusty drums, warm Rhodes chords, vinyl crackle, mellow bass, and soft synth pad
stack(
  // Dusty drums with subtle swing and sidechain-style compression
  s("bd*4,hh*8,[~ cp]!2")
    .bank("DustyDrums")
    .fast(1.2)
    .slow(1.1)
    .sometimesBy(0.2, x => x.gain(0.8))
    .room(0.4),
  // Warm Rhodes chords with gentle variation every 4 bars
  n("0 4 7 10")
    .scale("C:major")
    .sound("rhodes")
    .slow(2)
    .chunk(4, x => x.trans(2))
    .gain(0.6)
    .lpf(800)
    .room(0.7),
  // Mellow bass line with subtle movement
  n("0 ~ 3 ~ 5 ~ 3 ~")
    .scale("C2:major")
    .sound("bass")
    .slow(2)
    .clip(0.9)
    .lpf(200)
    .gain(0.5),
  // Soft synth pad with light filter automation
  sound("supersaw")
    .slow(4)
    .lpf(saw.range(200, 800).segment(16))
    .gain(0.4)
    .room(0.8),
  // Vinyl crackle for added atmosphere
  sound("vinylCrackle")
    .slow(8)
    .gain(0.2)
    .hpf(100)
).cpm(82.5)
```

And with some additional parameters for model, style, complexity and BPM, i can direct the AI a bit more to produce my vision.

For example, I sent this prompt to Claude 4.5 Sonnet Thinking with the style Experimental, complexity Complex and a tempo of 130 BPM:

```
Experimental
Complex
Generate Strudel code for a **hard-hitting bass track** designed for a modern electronic TV show sequence or underground club scene. - **Tempo:** 130–140 bpm - **Instruments:** deep sub-bass, punchy kick, crisp hats, distorted synth lead, short vocal chops - **Mood:** dark, energetic, and powerful with a rolling groove - **Style:** syncopated rhythms, bass modulation, and evolving percussion fills - **Structure:** 16-bar loop that builds intensity with filter sweeps and rhythmic stabs Add comments marking build-up, drop, and breakdown sections.
```

What came out is much more interesting musically ([REPL Link](https://strudel.cc/)).

```javascript
stack(
  // === KICK: Punchy foundation with syncopated accents ===
  s("bd*4")
    .bank("RolandTR909")
    .gain("1 0.9 1 [0.9 1.1]")
    // Drop: add extra kicks for intensity
    .chunk(4, x => x.fast("<1 1 1 [1.5 2]>"))
    .shape(0.3)
    .room(0.1),
  // === SUB-BASS: Deep rolling bassline with modulation ===
  n("0 [0 7] 3 [5 3] 0 [0 10] 5 [7 5]")
    .scale("D1:phrygian")
    .sound("sawtooth")
    .n("<2 4 8 16>") // additive partials for texture
    .gain(0.85)
    // Bass modulation with filter sweep
    .lpf(sine.slow(4).range(80, 400))
    .shape(0.6)
    .distort(0.3)
    // Build-up: filter opens
    .lpf(saw.slow(16).range(80, 1200).segment(32))
    .clip(0.85)
    .compress(0.9, 0),
  // === HATS: Crisp evolving percussion with fills ===
  s("hh(7,16) ~ [hh:1 hh:2]*2 ~")
    .bank("RolandTR909")
    .gain(perlin.slow(8).range(0.5, 0.9))
    // Breakdown: sparse hats
    .mask("<1 1 1 [1 0 1 0]>/4")
    // Build-up: increasing density
    .sometimesBy(saw.slow(16).segment(8), x => x.fast(2).degradeBy(0.3))
    .hpf(8000)
    .pan(sine.slow(3).range(0.3, 0.7))
    .room(0.2),
  // === DISTORTED LEAD: Rhythmic stabs and drops ===
  note("<[d4 ~] [~ f4] [~ ~] [g4 ab4]>*2")
    .sound("square")
    .gain(0.7)
    .shape(0.8)
    .crush(4)
    // Drop section: aggressive stabs
    .chunk(4, x => x.struct("1 0 [1 1] 0 1 0 [1 0] [1 1]"))
    // Filter sweep for builds
    .lpf(saw.slow(8).range(400, 4000).segment(16))
    .resonance(6)
    .delay(0.125)
    .delayfeedback(0.4)
    .room(0.4)
    .pan(cosine.slow(2).range(0.2, 0.8)),
  // === VOCAL CHOPS: Short processed hits ===
  s("~ <[vocal:0 vocal:2] ~ ~ [vocal:1 vocal:3]>")
    .bank("vcsl")
    .speed("<1 0.8 1.2 -1>")
    .gain(0.6)
    .coarse("<16 8 4 32>")
    .lpf(2000)
    .hpf(300)
    // Drop: more frequent chops
    .sometimesBy(0.4, x => x.ply(2))
    .delay(0.375)
    .delayfeedback(0.3)
    .room(0.5)
    .pan(rand.range(0.2, 0.8)),
  // === PERCUSSION FILLS: Evolving breaks and builds ===
  s("[~ cp] ~ [~ cp] <~ [cp sd:1]*2>")
    .bank("RolandTR909")
    .gain(0.8)
    // Build-up: increasing fills
    .lastOf(4, x => x.fast(2).struct("1 [1 1] 1 [1 1 1]"))
    // Breakdown: minimal
    .firstOf(4, x => x.degradeBy(0.6))
    .shape(0.2)
    .room(0.3)
    .hpf(200),
  // === TEXTURE: Dark atmospheric layer ===
  sound("<brown pink>")
    .gain(sine.slow(32).range(0.05, 0.15))
    .lpf(perlin.slow(16).range(100, 600))
    .hpf(40)
    .room(0.9)
    .roomsize(0.8)
    // Build-up: rising noise
    .chunk(4, x => x.gain(saw.slow(4).range(0.05, 0.25)))
).cpm(32.5) // ~130 BPM

/* SECTION GUIDE:
 * - BREAKDOWN: bars 1-4 (sparse, minimal hats, degraded percussion)
 * - BUILD-UP: bars 5-12 (filter sweeps open, percussion density increases, rising noise)
 * - DROP: bars 13-16 (full intensity, extra kicks, aggressive stabs, frequent vocal chops)
 * Sections cycle via .chunk(4,...), .firstOf(4,...), .lastOf(4,...), and slow signal modulation
 */
```

### Building a frontend

The last part is just to build a simple frontend, thankfully for me, this isn't all that complex as Strudel have open sourced a few of the components they use on their own website so I just need to install those and load it in, although sadly they don't come with types (that's why I have a few ts-ignore comments here).

To get started, we need a prebake function, this loads in the modules that we need to run Strudel in our app as well as the sounds and samples that we will use in our music.

```typescript
import { evalScope, noteToMidi, valueToMidi, Pattern } from "@strudel/core";
import { initAudioOnFirstClick, registerSynthSounds, samples, aliasBank, registerZZFXSounds } from "@strudel/webaudio";

async function prebake() {
  initAudioOnFirstClick();

  const modulesLoading = evalScope(
    import("@strudel/core"),
    import("@strudel/draw"),
    import("@strudel/mini"),
    import("@strudel/tonal"),
    import("@strudel/webaudio"),
    import("@strudel/codemirror"),
    import("@strudel/hydra"),
    import("@strudel/midi"),
  );

  const ds = "https://raw.githubusercontent.com/felixroos/dough-samples/main/";
  const ts = "https://raw.githubusercontent.com/todepond/samples/main/";

  await Promise.all([
    modulesLoading,
    registerSynthSounds(),
    registerZZFXSounds(),
    samples(`${ds}/tidal-drum-machines.json`),
    samples(`${ds}/piano.json`),
    samples(`${ds}/Dirt-Samples.json`),
    samples(`${ds}/EmuSP12.json`),
    samples(`${ds}/vcsl.json`),
    samples(`${ds}/mridangam.json`),
  ]);

  aliasBank(`${ts}/tidal-drum-machines-alias.json`);

  const maxPan = noteToMidi("C8");
  const panwidth = (pan: number, width: number) => pan * width + (1 - width) / 2;

  type StrudelValue = Record<string, unknown>;

  Pattern.prototype.piano = function (this: any) {
    return this.fmap((v: unknown) => {
      const vObj = v as StrudelValue;
      return { ...vObj, clip: vObj.clip ?? 1 };
    })
      .s("piano")
      .release(0.1)
      .fmap((value: unknown) => {
        const midi = valueToMidi(value);
        const pan = panwidth(Math.min(Math.round(midi) / maxPan, 1), 0.5);
        const valueObj = value as StrudelValue;
        const panValue = typeof valueObj.pan === "number" ? valueObj.pan : 1;
        return { ...valueObj, pan: panValue * pan };
      });
  };
}

export { prebake };
```

Then it's just a case of loading up their codemirror component with a few parameters and a play/pause button.

Because their component isn't built directly for React though, we do have to do it a bit more complex that just loading it in.

First we need to load create a basic component that contains a ref that we can load the codemirror into:

```typescript
<div className="relative w-full rounded-xl border bg-gradient-to-b from-slate-950 via-slate-950/95 to-slate-950/90 overflow-hidden shadow-lg shadow-slate-900/40">
  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/80 bg-slate-900/80">
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono uppercase tracking-wide text-slate-400">
        Strudel Live Code
      </span>
    </div>
    <div className="flex-1 flex items-center justify-end text-[11px] text-slate-400">
      {isPlaying && (
        <span className="text-emerald-300">Playing current pattern</span>
      )}
    </div>
    <div className="flex items-center gap-2">
      <Button size="icon" variant="ghost" onClick={handlePlay} disabled={isPlaying} aria-label={isPlaying ? "update" : "play"} className="h-7 w-7 rounded-full hover:bg-emerald-500/20">
        <Play className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" onClick={handlePause} disabled={!isPlaying} aria-label="pause" className="h-7 w-7 rounded-full hover:bg-rose-500/20">
        <Pause className="h-3.5 w-3.5" />
      </Button>
    </div>
  </div>
  <div ref={editorContainerRef} className="w-full min-h-[320px]" />
</div>
```

Next up, we create a useEffect that loads in the library and sets our parameters:

```typescript
import { StrudelMirror } from "@strudel/codemirror";
import { getAudioContext, webaudioOutput } from "@strudel/webaudio";
import { transpiler } from "@strudel/transpiler";
import { prebake } from "./strudel";

const [isPlaying, setIsPlaying] = useState(false);
const [error, setError] = useState<string | null>(null);
const editorContainerRef = useRef<HTMLDivElement>(null);
const editorRef = useRef<StrudelMirrorInstance | null>(null);

useEffect(() => {
  if (!editorContainerRef.current || editorRef.current) return;

  const editor = new StrudelMirror({
    theme: "teletext",
    defaultOutput: webaudioOutput,
    getTime: () => getAudioContext().currentTime,
    transpiler,
    root: editorContainerRef.current,
    initialCode: sanitizeStrudelCode(code),
    drawTime: [-2, 2],
    prebake,
    onChange: (update: any) => {
      if (update.docChanged) {
        onChange?.(update.state.doc.toString());
      }
    },
  });

  editor.setTheme("tokyoNight");
  editorRef.current = editor;

  return () => {
    if (editorRef.current) {
      editorRef.current.stop();
    }
  };
}, []);
```

To react to the code being changed when the AI generates a new pattern we add this effect:

```typescript
useEffect(() => {
  if (editorRef.current) {
    const sanitized = sanitizeStrudelCode(code);
    if (editorRef.current.code !== sanitized) {
      editorRef.current.setCode(sanitized);
    }
  }
}, [code]);
```

And then to play and pause, we need to use the methods provided by the editor:

```typescript
const handlePlay = useCallback(async () => {
  const editor = editorRef.current;
  if (!editor) return;

  try {
    await editor.evaluate();
    setIsPlaying(true);
    setError(null);
  } catch (err) {
    setError(err instanceof Error ? err.message : "Evaluation error");
  }
}, []);

const handlePause = useCallback(() => {
  const editor = editorRef.current;
  if (!editor) return;

  editor.stop();
  setIsPlaying(false);
}, []);

useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.altKey && e.key === "Enter") {
      e.preventDefault();
      handlePlay();
    } else if (e.altKey && (e.key === "." || e.key === "≥")) {
      e.preventDefault();
      handlePause();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [handlePlay, handlePause]);
```

And that's it! Now we have a Strudel player in our app. You can [find the full component here](https://github.com/nicholasgriffintn/ai-platform/tree/main/apps/app/src/components/Strudel).

## What's next?

What I've really enjoyed about this is that I've been able to go off and explore something completely out of my usual day to day which is really just coding.

I don't get that opportunity a lot so it's been a ton of fun and that's what I'm where I find AI useful so far.

The prompt isn't the best just yet though, it definitely has some big limitations in that it doesn't load up the full knowledge of what sounds and samples is available to it, sometimes the output can also be a little strange.

I'm definitely going to keep working on it to see if I can get something working full time.

In the meantime, [you can check it out for yourself on Polychat](https://polychat.app/apps/strudel/new).

---

**Source:** https://nicholasgriffin.dev/blog/creating-strudel-live-coding-patterns-with-ai/
**License:** CC BY-SA 4.0
