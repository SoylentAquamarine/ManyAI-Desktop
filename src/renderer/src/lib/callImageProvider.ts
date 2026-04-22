/**
 * callImageProvider.ts — Image generation via Pollinations (free) or OpenAI DALL-E.
 *
 * Pollinations note: Electron's Chromium renderer sends cookies, which makes
 * Pollinations think we're an authenticated user and return HTTP 500 "use
 * enter.pollinations.ai".  Fix: credentials:'omit' strips cookies so the
 * request looks anonymous — exactly how React Native / mobile fetches work.
 */

export type ImageProvider = 'pollinations' | 'openai-dalle';

export interface ImageResult {
  imageUrl: string;   // always a data: URI so <img> and download both work
  provider: ImageProvider;
  model: string;
  error?: string;
}

const TIMEOUT_MS = 60_000; // image gen can be slow

/** Fetch with timeout + anonymous credentials (no cookies sent) */
function anonFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, {
    ...options,
    credentials: 'omit',   // ← prevents cookies that trigger Pollinations auth check
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

/**
 * Converts an ArrayBuffer to a base64 string.
 * Works in Electron renderer (Chromium) and React Native alike.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function callImageProvider(
  prompt: string,
  provider: ImageProvider = 'pollinations',
  apiKey?: string,
): Promise<ImageResult> {
  try {
    // ── Pollinations (free, no key) ─────────────────────────────────────────
    if (provider === 'pollinations') {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true`;
      const res = await anonFetch(url);

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
      }

      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        throw new Error(`Unexpected content-type: ${contentType}`);
      }

      const mime = contentType.split(';')[0].trim();
      const base64 = arrayBufferToBase64(await res.arrayBuffer());
      return { imageUrl: `data:${mime};base64,${base64}`, provider, model: 'Pollinations · Flux' };
    }

    // ── OpenAI DALL-E 3 ────────────────────────────────────────────────────
    if (provider === 'openai-dalle') {
      if (!apiKey) throw new Error('OpenAI API key required for DALL-E');

      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'url' }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      const imgUrl: string = json?.data?.[0]?.url ?? '';
      if (!imgUrl) throw new Error('No image URL returned');

      // Fetch the URL and convert to data URI so download works offline
      const imgRes = await anonFetch(imgUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch image: HTTP ${imgRes.status}`);
      const ct = (imgRes.headers.get('content-type') ?? 'image/png').split(';')[0].trim();
      const base64 = arrayBufferToBase64(await imgRes.arrayBuffer());
      return { imageUrl: `data:${ct};base64,${base64}`, provider, model: 'DALL-E 3' };
    }

    throw new Error(`Unknown image provider: ${provider}`);
  } catch (err) {
    return { imageUrl: '', provider, model: '', error: err instanceof Error ? err.message : String(err) };
  }
}
