import { describe, expect, it } from 'vitest';
import { createAttributor, OTHER_LANE_ID } from '@/lib/timeline/attribute';
import type { LaneSource } from '@/lib/timeline/types';

const lane = (id: string, range: [number, number], refs: string[] = []): LaneSource => ({
  id,
  kind: 'stackArg',
  label: null,
  range,
  statementRange: [0, 200],
  refs,
});

const def = (name: string, range: [number, number]): LaneSource => ({
  id: `def:${name}`,
  kind: 'definition',
  label: name,
  range,
  statementRange: range,
  refs: [],
});

describe('createAttributor', () => {
  const sources = [
    def('crdpart', [110, 140]),
    def('shared', [150, 180]),
    lane('stack:0:0', [10, 50]),
    lane('stack:0:1', [60, 100], ['crdpart', 'shared']),
    lane('stack:0:2', [101, 108], ['shared']),
  ];
  const attributor = createAttributor(sources);

  it('attributes by location intersection', () => {
    expect(attributor.attribute([{ start: 12, end: 15 }])).toBe('stack:0:0');
    expect(attributor.attribute([{ start: 62, end: 65 }])).toBe('stack:0:1');
  });

  it('majority wins for multi-location haps', () => {
    expect(
      attributor.attribute([
        { start: 12, end: 15 },
        { start: 62, end: 65 },
        { start: 64, end: 70 },
      ]),
    ).toBe('stack:0:1');
  });

  it('falls back to the sole lane referencing a definition', () => {
    expect(attributor.attribute([{ start: 112, end: 115 }])).toBe('stack:0:1');
  });

  it('uses the other lane for ambiguous definitions', () => {
    expect(attributor.attribute([{ start: 152, end: 155 }])).toBe(OTHER_LANE_ID);
  });

  it('uses the other lane when locations are missing', () => {
    expect(attributor.attribute(undefined)).toBe(OTHER_LANE_ID);
    expect(attributor.attribute([])).toBe(OTHER_LANE_ID);
  });

  it('handles the line/column location shape', () => {
    expect(
      attributor.attribute([
        { start: { line: 1, column: 12, offset: 12 }, end: { line: 1, column: 15, offset: 15 } },
      ]),
    ).toBe('stack:0:0');
  });
});
