/**
 * vitest stub: @strudel/core's repl.mjs imports SalatRepl from
 * '@kabelsalat/web', whose node build doesn't expose that named export.
 * Tests evaluate patterns headlessly and never construct a repl, so an empty
 * class keeps the import graph satisfied.
 */
export class SalatRepl {}
