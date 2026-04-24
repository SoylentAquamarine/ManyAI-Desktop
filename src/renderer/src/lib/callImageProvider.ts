/**
 * callImageProvider.ts — Image generation via Pollinations (free) or OpenAI DALL-E.
 *
 * Pollinations note: Electron's Chromium renderer adds browser headers
 * (User-Agent, Sec-Fetch-*, etc.) that make Pollinations think it's an
 * authenticated user and return HTTP 500.  Fix: route Pollinations fetches
 * through the main process via IPC (window.api.fetchImage) which uses plain
 * Node.js https with no browser headers — exactly like React Native.
 */

// 'openai' matches the ProviderKey in providers.ts so routing is unified.
export type ImageProvider = 'pollinations' | 'openai';

export interface ImageProviderConfig {
  label: string;
  defaultModel: string;
  models: { id: string; name: string }[];
}

export const IMAGE_PROVIDER_CONFIGS: Record<ImageProvider, ImageProviderConfig> = {
  'pollinations': {
    label: 'Pollinations (free)',
    defaultModel: 'flux',
    models: [
      { id: 'flux',         name: 'Flux' },
      { id: 'flux-realism', name: 'Flux Realism' },
      { id: 'flux-anime',   name: 'Flux Anime' },
      { id: 'flux-3d',      name: 'Flux 3D' },
      { id: 'turbo',        name: 'Turbo' },
      { id: 'gptimage',     name: 'GPT Image' },
    ],
  },
  'openai': {
    label: 'OpenAI DALL·E',
    defaultModel: 'dall-e-3',
    models: [
      { id: 'dall-e-3', name: 'DALL·E 3' },
      { id: 'dall-e-2', name: 'DALL·E 2' },
    ],
  },
};

export interface ImageResult {
  imageUrl: string;   // always a data: URI so <img> and download both work
  provider: string;
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
  provider: ImageProvider,
  model: string,
  apiKey?: string,
): Promise<ImageResult> {
  if (provider === 'pollinations') {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&model=${encodeURIComponent(model)}`;
    const { base64, mime } = await fetchImageViaMain(url);
    return { imageUrl: `data:${mime};base64,${base64}`, provider, model };
  }
  if (provider === 'openai') {
    if (!apiKey) throw new Error('OpenAI API key required for DALL-E');
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', response_format: 'url' }),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
    }
    const json = await res.json();
    const imgUrl: string = json?.data?.[0]?.url ?? '';
    if (!imgUrl) throw new Error('No image URL returned');
    const { base64, mime } = await fetchImageViaMain(imgUrl);
    return { imageUrl: `data:${mime};base64,${base64}`, provider, model };
  }
  throw new Error(`Provider "${provider}" does not support image generation`);
}
