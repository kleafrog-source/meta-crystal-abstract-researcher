'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { soundMap } from '@strudel/webaudio';
import { classifySound, type SoundInfo } from './sounds';

/** Live view of superdough's registered sounds, classified for the UI. */
export function useSounds(): SoundInfo[] {
  const map = useSyncExternalStore(
    (cb) => soundMap.listen(cb),
    () => soundMap.get(),
    () => ({}),
  );
  return useMemo(
    () =>
      Object.entries(map ?? {})
        .filter(([name]) => !name.startsWith('_'))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map(([name, entry]) => classifySound(name, (entry as any)?.data ?? {}))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [map],
  );
}
