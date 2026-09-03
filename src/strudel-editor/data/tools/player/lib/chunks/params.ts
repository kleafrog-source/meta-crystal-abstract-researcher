/** Knob definitions and bindings into a chunk's method chain. */
import type { ChunkInfo } from './detect';

export interface ParamSpec {
  name: string;
  min: number;
  max: number;
  default: number;
  scale: 'lin' | 'log';
}

export const KNOB_PARAMS: ParamSpec[] = [
  { name: 'gain', min: 0, max: 2, default: 1, scale: 'lin' },
  { name: 'room', min: 0, max: 1, default: 0.3, scale: 'lin' },
  { name: 'lpf', min: 50, max: 20000, default: 8000, scale: 'log' },
  { name: 'hpf', min: 20, max: 8000, default: 20, scale: 'log' },
  { name: 'delay', min: 0, max: 1, default: 0.25, scale: 'lin' },
  { name: 'pan', min: 0, max: 1, default: 0.5, scale: 'lin' },
  { name: 'dist', min: 0, max: 4, default: 0, scale: 'lin' },
  { name: 'speed', min: 0.25, max: 4, default: 1, scale: 'log' },
];

export interface KnobBinding {
  spec: ParamSpec;
  /** the chain has a `.name(...)` call */
  bound: boolean;
  value: number;
  /** false when the arg isn't a plain numeric literal (pattern, slider, …) */
  editable: boolean;
}

export function getKnobBindings(chunk: ChunkInfo): KnobBinding[] {
  return KNOB_PARAMS.map((spec) => {
    const call = chunk.chain.find((c) => c.name === spec.name);
    if (!call) return { spec, bound: false, value: spec.default, editable: true };
    const arg = call.args[0];
    if (!arg || arg.numeric === null) return { spec, bound: true, value: spec.default, editable: false };
    return { spec, bound: true, value: arg.numeric, editable: true };
  });
}
