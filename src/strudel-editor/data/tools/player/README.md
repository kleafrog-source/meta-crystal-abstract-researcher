# PLAYER

[Try the demo](https://player-eight-teal.vercel.app/). Export your work before you leave the demo:
saving between sessions is not supported there.

PLAYER is a local-first song builder for [Strudel](https://strudel.cc). It keeps Strudel code as the
source of truth while adding visual tools for editing patterns, arranging sections, browsing sounds,
and controlling playback.

The app is built with Next.js, React, CodeMirror, Strudel, and IndexedDB. Songs are saved in the
browser, can be exported as `.strudel` files, and can be shared through compressed URL hashes.

Disclaimer: PLAYER was made with ample amounts of vibe coding. Expect experimental edges, especially
around complex Strudel syntax and browser-specific audio behavior.

## Features

- Live Strudel code editing with CodeMirror and active-event highlighting
- Play, stop, seek, loop, BPM, and cycle controls
- Chunk-aware editing for pattern statements
- Step sequencer for drum patterns
- Piano roll for melody patterns
- Effect knobs that update numeric method-chain literals such as `.gain(0.6)`
- Quick transforms for room, low-pass filter, distortion, speed, and reverse
- Sound browser for built-in Strudel sounds, with preview and insert-at-cursor
- Song timeline generated from evaluated Strudel patterns, not syntax alone
- Arrangement editing for recognized `pickRestart` and `arrange` structures
- Local song library backed by IndexedDB autosave
- Import and export for `.strudel`, `.js`, and `.txt` song files
- Share links that store compressed song data in the URL hash without a server

## How It Works

PLAYER treats text as the durable format. Visual edits parse the current document, make a constrained
change, and write the result back to CodeMirror. When the syntax is outside an editor's safe subset,
the app falls back to code editing instead of guessing.

Key areas:

- `components/editor/` - the main editor surface, transport, chunk toolbar, and visual panels
- `components/timeline/` - arrangement strip, playhead, ruler, and section editing UI
- `components/step-sequencer/` - grid editing for drum patterns
- `components/piano-roll/` - grid editing for pitched material
- `components/sound-browser/` - searchable sound browser and audition UI
- `lib/strudel/` - Strudel engine integration, playback, audition, sound loading, and prebaking
- `lib/chunks/` - source parsing and chunk detection
- `lib/notation/` - editable mini-notation model, parser, serializer, pitch, and resize logic
- `lib/timeline/` - pattern analysis, period detection, lane attribution, recognition, and edits
- `lib/persistence/` - local songs, file export/import, and share URL encoding

## Requirements

- Node.js 20 or newer
- pnpm

## Development

Install dependencies:

```sh
pnpm install
```

Run the development server:

```sh
pnpm dev
```

The default Next.js dev server runs at `http://localhost:3000`.

This repo also includes Makefile shortcuts. If `portless` is available locally, `make run-dev` runs
the app at `https://player.localhost:1355`.

```sh
make install
make run-dev
make test
make lint
make build
```

## Testing

Run the test suite:

```sh
pnpm test
```

Run linting:

```sh
pnpm lint
```

Build for production:

```sh
pnpm build
```

## Project Status

PLAYER is an experimental editor for composing with Strudel. The parsing and visual editing layers are
intentionally conservative: supported structures are round-tripped deterministically, and unsupported
structures remain editable as code.

## License

PLAYER is released under the GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).

This app depends on AGPL-licensed Strudel-related packages, including
[superdough](https://www.npmjs.com/package/superdough). If you deploy a modified version publicly or
make it available over a network, make the corresponding source code available to users as required by
the AGPL.
