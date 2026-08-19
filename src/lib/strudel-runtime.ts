"use client";

let runtimePromise: Promise<typeof import("@strudel/web")> | null = null;
let initPromise: Promise<unknown> | null = null;
let samplesLoaded = false;

export async function getStrudelRuntime() {
  if (!runtimePromise) {
    runtimePromise = import("@strudel/web");
  }
  return runtimePromise;
}

export async function ensureStrudelInitialized() {
  const runtime = await getStrudelRuntime();
  if (!initPromise) {
    initPromise = runtime.initStrudel();
  }
  const repl = await initPromise;
  if (!samplesLoaded) {
    runtime.samples("github:tidalcycles/dirt-samples");
    samplesLoaded = true;
  }
  return { runtime, repl };
}
