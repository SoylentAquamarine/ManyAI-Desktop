/**
 * callImageProvider.ts — Image generation via Pollinations (free) or OpenAI DALL-E.
 *
 * Pollinations note: Electron's Chromium renderer adds browser headers
 * (User-Agent, Sec-Fetch-*, etc.) that make Pollinations think it's an
 * authenticated user and return HTTP 500.  Fix: route Pollinations fetches
 * through the main process via IPC (window.api.fetchImage) which uses plain
 * Node.js https with no browser headers — exactly like React Native.
 */

export type ImageProvider = 'pollinations' | 'openai-dalle';

export interface ImageResult {
  imageUrl: string;   // always a data: URI so <img> and download both work
  provider: ImageProvider;
  model: string;
  error?: string;
}

/** Fetch an image URL via the main process (Node.js — no browser headers). */
async function fetchImageViaMain(url: string): Promise<{ base64: string; mime: string }> {
  const result = await window.api.fetchImage(url);
  if ('error' in result) throw new Error(result.error);
  return result;
}

export async function callImageProvider(
  prompt: string,
  provider: ImageProvider = 'pollinations',
  apiKey?: string,
): Promise<ImageResult> {
  try {
    // ── Pollinations (free, no key) ─────────────────────────────────────────
    // Fetch via main process so Node.js http (not Chromium) makes the request.
    if (provider === 'pollinations') {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true`;
      const { base64, mime } = await fetchImageViaMain(url);
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

      // Fetch via main process as well to get a stable data URI
      const { base64, mime } = await fetchImageViaMain(imgUrl);
      return { imageUrl: `data:${mime};base64,${base64}`, provider, model: 'DALL-E 3' };
    }

    throw new Error(`Unknown image provider: ${provider}`);
  } catch (err) {
    return { imageUrl: '', provider, model: '', error: err instanceof Error ? err.message : String(err) };
  }
}
