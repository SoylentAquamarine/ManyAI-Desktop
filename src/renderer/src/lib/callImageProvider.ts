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

const TIMEOUT_MS = 45_000; // image gen can be slow

/**
 * Generate an image from a text prompt.
 * provider: 'pollinations' — free, no key needed
 * provider: 'openai-dalle' — requires OpenAI API key, uses DALL-E 3
 */
export async function callImageProvider(
  prompt: string,
  provider: ImageProvider = 'pollinations',
  apiKey?: string,
): Promise<ImageResult> {
  try {
    if (provider === 'pollinations') {
      // Params: width/height for reasonable size, nologo removes watermark
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=512&nologo=true&seed=${Math.floor(Math.random() * 99999)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const imageUrl = await blobToDataURL(blob);
      return { imageUrl, provider, model: 'Pollinations' };
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

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
