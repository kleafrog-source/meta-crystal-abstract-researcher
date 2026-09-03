'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { decodeShareHash } from '@/lib/persistence/share';
import { createSong, saveSong } from '@/lib/persistence/songs';

export default function SharePage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const decoded = decodeShareHash(window.location.hash);
      if (!decoded) {
        setFailed(true);
        return;
      }
      const song = createSong({ title: decoded.title, code: decoded.code });
      await saveSong(song);
      router.replace(`/song/${song.id}`);
    })();
  }, [router]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4">
      {failed ? (
        <>
          <p className="text-sm text-ember">couldn&apos;t read that share link</p>
          <Link href="/" className="text-xs text-text-dim underline underline-offset-4 hover:text-text">
            back to songs
          </Link>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <span className="led led-loading" />
          <span className="silkscreen">opening shared song</span>
        </div>
      )}
    </div>
  );
}
