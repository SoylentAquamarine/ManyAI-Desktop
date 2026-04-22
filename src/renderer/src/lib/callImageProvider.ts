/**
 * callImageProvider.ts — Image generation via Pollinations (free) or OpenAI DALL-E.
 */

export type ImageProvider = 'pollinations' | 'openai-dalle';

export interface ImageResult {
  imageUrl: string;
  provider: ImageProvider;
  model: string;
  error?: string;
}

const TIMEOUT_MS = 45_000;

export async function callImageProvider(
  prompt: string,
  provider: ImageProvider = 'pollinations',
  apiKey?: string,
): Promise<ImageResult> {
  try {
    if (provider === 'pollinations') {
      // Return the URL directly — Electron renders cross-origin images fine (webSecurity: false)
      // Random seed ensures each call generates a fresh image
      const seed = Math.floor(Math.random() * 999999);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=768&height=512`;
      return { imageUrl, provider, model: 'Pollinations · Flux' };
    }

    if (provider === 'openai-dalle') {
      if (!apiKey) throw new Error('OpenAI API key required for DALL-E');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024',
          response_format: 'url',
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      const imageUrl: string = json?.data?.[0]?.url ?? '';
      if (!imageUrl) throw new Error('No image URL returned');
      return { imageUrl, provider, model: 'DALL-E 3' };
    }

    throw new Error(`Unknown image provider: ${provider}`);
  } catch (err) {
    return {
      imageUrl: '',
      provider,
      model: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
