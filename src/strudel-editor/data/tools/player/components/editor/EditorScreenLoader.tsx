'use client';

import dynamic from 'next/dynamic';

/**
 * The SSR boundary: everything below imports @strudel/* (browser-only ESM),
 * so the whole editor tree loads client-side only.
 */
const EditorScreen = dynamic(() => import('./EditorScreen'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center">
      <div className="flex items-center gap-3">
        <span className="led led-loading" />
        <span className="silkscreen">loading player</span>
      </div>
    </div>
  ),
});

export default function EditorScreenLoader({ songId }: { songId: string }) {
  return <EditorScreen songId={songId} />;
}
