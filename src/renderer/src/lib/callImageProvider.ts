/**
 * callImageProvider.ts — Image generation via Pollinations (free) or OpenAI DALL-E.
 */

export type ImageProvider = 'pollinations' | 'openai-dalle';

export interface ImageResult {
  imageUrl: string;   // always a data: URI so <img> and download both work
  provider: ImageProvider;
  model: string;
  error?: string;
}

const TIMEOUT_MS = 60_000; // image gen can be slow

export async function callImageProvider(
  prompt: string,
  provider: ImageProvider = 'pollinations',
  apiKey?: string,
): Promise<ImageResult> {
  try {
    if (provider === 'pollinations') {
      const seed = Math.floor(Math.random() * 999999);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?seed=${seed}&width=768&height=512&nologo=false`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 100) : ''}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        // Might be JSON with a URL inside — try to extract it
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          const imgUrl: string = json?.url ?? json?.imageUrl ?? json?.data?.[0]?.url ?? '';
          if (imgUrl) {
            const imgRes = await fetch(imgUrl);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              return { imageUrl: await blobToDataURL(blob), provider, model: 'Pollinations · Flux' };
            }
          }
        } catch {}
        throw new Error(`Unexpected response type: ${contentType || 'unknown'}`);
      }

      const blob = await res.blob();
      return { imageUrl: await blobToDataURL(blob), provider, model: 'Pollinations · Flux' };
    }

    if (provider === 'openai-dalle') {
      if (!apiKey) throw new Error('OpenAI API key required for DALL-E');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'url' }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      const imgUrl: string = json?.data?.[0]?.url ?? '';
      if (!imgUrl) throw new Error('No image URL returned');
      // Fetch and convert to data URI so download works
      const imgRes = await fetch(imgUrl);
      if (!imgRes.ok) throw new Error(`Failed to fetch generated image: HTTP ${imgRes.status}`);
      const blob = await imgRes.blob();
      return { imageUrl: await blobToDataURL(blob), provider, model: 'DALL-E 3' };
    }

    throw new Error(`Unknown image provider: ${provider}`);
  } catch (err) {
    return { imageUrl: '', provider, model: '', error: err instanceof Error ? err.message : String(err) };
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
