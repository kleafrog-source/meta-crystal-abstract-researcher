/** Share songs via URL hash — code never touches a server. */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

interface SharePayload {
  t: string; // title
  c: string; // code
}

export function encodeShareHash(title: string, code: string): string {
  return compressToEncodedURIComponent(JSON.stringify({ t: title, c: code } satisfies SharePayload));
}

export function buildShareUrl(title: string, code: string): string {
  return `${window.location.origin}/s#${encodeShareHash(title, code)}`;
}

export function decodeShareHash(hash: string): { title: string; code: string } | null {
  try {
    const raw = decompressFromEncodedURIComponent(hash.replace(/^#/, ''));
    if (!raw) return null;
    const payload = JSON.parse(raw) as SharePayload;
    if (typeof payload.c !== 'string') return null;
    return { title: payload.t || 'shared song', code: payload.c };
  } catch {
    return null;
  }
}
