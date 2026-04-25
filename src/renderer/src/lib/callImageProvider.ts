/**
 * callImageProvider.ts — Image generation via any provider whose models are
 * flagged supportsImageGen: true.
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

/** Check whether a specific provider+model is flagged for image generation. */
export function isImageGenModel(providerKey: string, modelId: string): boolean {
  const provider = getAllProviders()[providerKey]
  if (!provider) return false
  return provider.models.some(m => m.id === modelId && m.supportsImageGen)
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
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&model=${encodeURIComponent(model)}`
    const { base64, mime } = await fetchImageViaMain(url)
    return { imageUrl: `data:${mime};base64,${base64}`, provider: providerKey, model }
  }

  if (providerKey === 'openai') {
    if (!apiKey) throw new Error('OpenAI API key required for DALL-E')
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', response_format: 'url' }),
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
  const res = await fetch(`${provider.baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024', response_format: 'url' }),
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
