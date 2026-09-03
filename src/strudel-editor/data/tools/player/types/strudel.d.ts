/* Ambient types for the untyped @strudel/* + superdough ESM packages.
   Loosely typed on purpose — only the surfaces this app touches. */

declare module '@strudel/core' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const Pattern: any;
  export function evalScope(...modules: unknown[]): Promise<unknown>;
  export function noteToMidi(note: string): number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function valueToMidi(value: any): number;
  export interface ReplState {
    started: boolean;
    isDirty: boolean;
    code: string;
    activeCode: string;
    error: Error | undefined;
    evalError: Error | undefined;
    schedulerError: Error | undefined;
    pending: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pattern: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    miniLocations: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    widgets: any[];
  }
  export interface Scheduler {
    started: boolean;
    cps: number;
    /** current scheduler position, in cycles */
    now(): number;
    setCps(cps: number): void;
    start(): void;
    stop(): void;
    pause(): void;
  }
  export interface Repl {
    scheduler: Scheduler;
    state: ReplState;
    evaluate(code: string, autostart?: boolean): Promise<unknown>;
    /** hot-swap the scheduled pattern (re-applies the editPattern hook) */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPattern(pattern: any, autostart?: boolean): Promise<unknown>;
    stop(): void;
    setCode?(code: string): void;
  }
  export function repl(options: Record<string, unknown>): Repl;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function silence(): any;
  /** headless code → pattern evaluation (used by tests; the app goes through StrudelMirror) */
  export function evaluate(
    code: string,
    transpiler?: unknown,
    transpilerOptions?: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ mode: string; pattern: any; meta: unknown }>;
}

declare module '@strudel/mini' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function mini2ast(code: string): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getLeaves(ast: any): any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getLeafLocations(code: string, ...args: any[]): any[];
}

declare module '@strudel/transpiler' {
  export function transpiler(
    code: string,
    options?: Record<string, unknown>,
  ): { output: string; miniLocations: unknown[]; widgets: unknown[] };
}

declare module '@strudel/webaudio' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const webaudioOutput: (...args: any[]) => unknown;
  export function getAudioContext(): AudioContext;
  export function initAudioOnFirstClick(options?: Record<string, unknown>): Promise<void>;
  export function registerSynthSounds(): Promise<unknown>;
  export function registerZZFXSounds(): Promise<unknown>;
  export function samples(
    map: string | Record<string, unknown>,
    baseUrl?: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  export function aliasBank(...args: unknown[]): Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const soundMap: { get(): Record<string, any>; listen(cb: (value: Record<string, any>) => void): () => void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function superdough(value: any, deadline: number, duration?: number): Promise<unknown>;
  export function getAnalyzerData(type?: 'time' | 'frequency', id?: number): Float32Array;
}

declare module '@strudel/codemirror' {
  import type { EditorView } from '@codemirror/view';
  import type { Repl } from '@strudel/core';

  export class StrudelMirror {
    constructor(options: Record<string, unknown>);
    editor: EditorView;
    repl: Repl;
    code: string;
    evaluate(autostart?: boolean): Promise<void>;
    stop(): Promise<void>;
    toggle(): Promise<void>;
    setCode(code: string): void;
    setTheme(theme: string): void;
    setFontSize(size: number): void;
    setFontFamily(family: string): void;
    clear(): void;
    flash(ms?: number): void;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const themes: Record<string, any>;
  export function activateTheme(theme: string): void;
  export function updateMiniLocations(view: EditorView, locations: unknown[]): void;
}

declare module '@strudel/draw' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function getDrawContext(): any;
}

declare module '@strudel/tonal' {}
