/**
 * callImageProvider.ts — Image generation via any provider whose models are
 * capabilities includes 'image'.
 *
 * Pollinations: routed through main process IPC because Chromium headers
 * cause HTTP 500 on Pollinations' servers.
 * OpenAI: uses /images/generations with response_format: 'url'.
 * Generic: assumes OpenAI-compatible /images/generations endpoint.
 */

import { getAllProviders } from './providers'

export interface ImageResult {
  imageUrl: string;   // always a data: URI so <img> and download both work
  provider: string;
  model: string;
  error?: string;
}

/** Check whether a specific provider+model has the 'image' capability. */
export function isImageGenModel(providerKey: string, modelId: string): boolean {
  const provider = getAllProviders()[providerKey]
  if (!provider) return false
  return provider.models.some(m => m.id === modelId && m.capabilities?.includes('image'))
}

/** Fetch an image URL via the main process (Node.js — no browser headers). */
async function fetchImageViaMain(url: string): Promise<{ base64: string; mime: string }> {
  const result = await window.api.fetchImage(url)
  if ('error' in result) throw new Error(result.error)
  return result
}

export async function callImageProvider(
  prompt: string,
  providerKey: string,
  model: string,
  apiKey?: string,
): Promise<ImageResult> {
  if (providerKey === 'pollinations') {
    const modelConfig = getAllProviders()[providerKey]?.models.find(m => m.id === model)
    const [pw, ph] = (modelConfig?.imageSize ?? '768x768').split('x')
    const seedParam = modelConfig?.randomSeed ? `&seed=${Math.floor(Math.random() * 2147483647)}` : ''
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${pw}&height=${ph}&nologo=true&model=${encodeURIComponent(model)}${seedParam}`
    const { base64, mime } = await fetchImageViaMain(url)
    return { imageUrl: `data:${mime};base64,${base64}`, provider: providerKey, model }
  }

  if (providerKey === 'openai') {
    if (!apiKey) throw new Error('OpenAI API key required for DALL-E')
    const openaiModelConfig = getAllProviders()[providerKey]?.models.find(m => m.id === model)
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: openaiModelConfig?.imageSize ?? '1024x1024', response_format: 'url' }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e?.error?.message ?? `HTTP ${res.status}`)
    }
    const json = await res.json()
    const imgUrl: string = json?.data?.[0]?.url ?? ''
    if (!imgUrl) throw new Error('No image URL returned')
    const { base64, mime } = await fetchImageViaMain(imgUrl)
    return { imageUrl: `data:${mime};base64,${base64}`, provider: providerKey, model }
  }

  // Generic OpenAI-compatible /images/generations for custom providers
  const provider = getAllProviders()[providerKey]
  if (!provider) throw new Error(`Unknown provider: ${providerKey}`)
  if (!apiKey) throw new Error(`API key required for ${provider.name}`)
  const genericModelConfig = provider.models.find(m => m.id === model)
  const res = await fetch(`${provider.baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, n: 1, size: genericModelConfig?.imageSize ?? '1024x1024', response_format: 'url' }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e?.error?.message ?? `HTTP ${res.status}`)
  }
  const json = await res.json()
  const imgUrl: string = json?.data?.[0]?.url ?? ''
  if (!imgUrl) throw new Error('No image URL returned')
  const { base64, mime } = await fetchImageViaMain(imgUrl)
  return { imageUrl: `data:${mime};base64,${base64}`, provider: providerKey, model }
}
