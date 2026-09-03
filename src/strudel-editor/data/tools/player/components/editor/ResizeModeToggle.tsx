'use client';

import type { ResizeMode } from '@/lib/notation/resize';

/**
 * How step-count changes treat existing hits:
 * spread = keep musical time (8→16 sounds identical), pad = keep step indices.
 */
export default function ResizeModeToggle({
  mode,
  onChange,
}: {
  mode: ResizeMode;
  onChange: (mode: ResizeMode) => void;
}) {
  const btn = (value: ResizeMode, title: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      title={title}
      className={`h-6 px-2 text-[10px] uppercase tracking-[0.12em] transition-colors ${
        mode === value ? 'bg-acid/15 text-acid' : 'text-text-faint hover:text-text-dim'
      }`}
    >
      {value}
    </button>
  );
  return (
    <span className="ml-1 inline-flex overflow-hidden rounded-sm border border-line">
      {btn('spread', 'keep musical time — the pattern sounds the same at the new resolution')}
      {btn('pad', 'keep step positions — add/remove steps at the end')}
    </span>
  );
}
