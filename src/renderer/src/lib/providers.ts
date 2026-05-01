/**
 * providers.ts — Provider registry loaded from disk at startup.
 *
 * Provider definitions live in <appRoot>/providers/*.json — one file per provider.
 * Edit, add, or remove those files to change what providers are available.
 * Only API keys are stored inside the app (localStorage via keyStore.ts).
 */

import type { WorkflowType } from './workflowTypes'

export type ProviderKey = string
export type TaskType = string

export interface ProviderModel {
  id: string
  name: string
  capabilities?: WorkflowType[]
  maxTokens?: number
  imageSize?: string
  randomSeed?: boolean
}

export interface Provider {
  key: ProviderKey
  name: string
  model: string
  models: ProviderModel[]
  baseUrl: string
  needsKey: boolean
  paidOnly: boolean
  color: string
  bestFor: TaskType[]
  goodAt: string
  notGreatAt: string
  supportsVision: boolean
  instructionsUrl: string
  extraHeaders?: Record<string, string>
  keyHint?: string
  sortOrder?: number
  /** How to call the text API. Default: "openai-compat" */
  apiFormat?: 'openai-compat' | 'gemini' | 'anthropic' | 'cloudflare' | 'pollinations' | string
  /** How to call the image API. Default: "openai-compat-image" */
  imageApiFormat?: 'openai-image' | 'pollinations-image' | 'openai-compat-image' | string
  /** Provider works without a key but can accept one if provided. */
  keyOptional?: boolean
}

// ── Runtime registry (populated by initProviders at startup) ─────────────────

let _providers: Record<string, Provider> = {}
let _order: string[] = []
let _ready = false

export async function initProviders(): Promise<void> {
  if (_ready) return
  const result = await window.api.readProviders()
  if ('error' in result) {
    console.error('Failed to load providers:', result.error)
    return
  }
  _providers = {}
  _order = []
  for (const p of result.providers as Provider[]) {
    _providers[p.key] = p
    _order.push(p.key)
  }
  _ready = true
}

export function getAllProviders(): Record<string, Provider> {
  return _providers
}

export function getAllProviderOrder(): string[] {
  return _order
}

export function getProvider(key: string): Provider | undefined {
  return _providers[key]
}

/** Keys of all loaded providers that don't require an API key. */
export function getKeylessProviderKeys(): string[] {
  return Object.keys(_providers).filter(k => !_providers[k].needsKey)
}

/** Add or update a provider. Updates memory immediately; writes JSON file in background. */
export function upsertProvider(provider: Provider): void {
  _providers[provider.key] = provider
  if (!_order.includes(provider.key)) _order.push(provider.key)
  window.api.writeProvider(provider.key, provider).catch(console.error)
}

/** Remove a provider. Updates memory immediately; deletes JSON file in background. */
export function removeProvider(key: string): void {
  delete _providers[key]
  _order = _order.filter(k => k !== key)
  window.api.deleteProvider(key).catch(console.error)
}
