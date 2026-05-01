/**
 * providerPrefs.ts — Provider enabled state, priority order, and selected models.
 * Enabled/disabled and model selection are stored in the provider JSON files.
 * Only the display order (a pure UI preference) stays in localStorage.
 */

import { getAllProviders, getAllProviderOrder, upsertProvider } from './providers'

const ORDER_KEY = 'manyai_provider_order'

export function saveProviderOrder(order: string[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order))
}

export function loadProviderOrder(): string[] {
  const raw = localStorage.getItem(ORDER_KEY)
  if (!raw) return getAllProviderOrder()
  try {
    const parsed = JSON.parse(raw) as string[]
    const allProviders = getAllProviders()
    const allOrder = getAllProviderOrder()
    const valid = parsed.filter(k => allProviders[k])
    const extras = allOrder.filter(k => !valid.includes(k))
    return [...valid, ...extras]
  } catch {
    return getAllProviderOrder()
  }
}

export function loadEnabledProviders(): Record<string, boolean> {
  const providers = getAllProviders()
  return Object.fromEntries(
    Object.entries(providers).map(([k, p]) => [k, p.enabled !== false])
  )
}

export function saveEnabledProviders(enabled: Record<string, boolean>): void {
  const providers = getAllProviders()
  for (const [k, isEnabled] of Object.entries(enabled)) {
    const p = providers[k]
    if (p && p.enabled !== isEnabled) {
      upsertProvider({ ...p, enabled: isEnabled })
    }
  }
}

export function loadSelectedModels(): Record<string, string> {
  const providers = getAllProviders()
  return Object.fromEntries(Object.entries(providers).map(([k, p]) => [k, p.model]))
}

export function saveSelectedModels(models: Partial<Record<string, string>>): void {
  const providers = getAllProviders()
  for (const [k, modelId] of Object.entries(models)) {
    const p = providers[k]
    if (modelId && p && p.model !== modelId) {
      upsertProvider({ ...p, model: modelId })
    }
  }
}

export function loadEnabledModels(): Record<string, boolean> {
  const providers = getAllProviders()
  const result: Record<string, boolean> = {}
  for (const [pk, p] of Object.entries(providers)) {
    for (const m of p.models) {
      result[`${pk}:${m.id}`] = m.enabled !== false
    }
  }
  return result
}

export function saveEnabledModels(enabled: Record<string, boolean>): void {
  const providers = getAllProviders()
  // Group changes by provider
  const byProvider: Record<string, Record<string, boolean>> = {}
  for (const [key, isEnabled] of Object.entries(enabled)) {
    const colonIdx = key.indexOf(':')
    const pk = key.slice(0, colonIdx)
    const modelId = key.slice(colonIdx + 1)
    if (!byProvider[pk]) byProvider[pk] = {}
    byProvider[pk][modelId] = isEnabled
  }
  for (const [pk, modelMap] of Object.entries(byProvider)) {
    const p = providers[pk]
    if (!p) continue
    upsertProvider({
      ...p,
      models: p.models.map(m => ({
        ...m,
        enabled: modelMap[m.id] !== undefined ? modelMap[m.id] : m.enabled,
      })),
    })
  }
}

export function isModelEnabled(providerKey: string, modelId: string): boolean {
  const m = getAllProviders()[providerKey]?.models.find(x => x.id === modelId)
  return m?.enabled !== false
}

export function setModelEnabled(providerKey: string, modelId: string, enabled: boolean): void {
  const p = getAllProviders()[providerKey]
  if (!p) return
  upsertProvider({ ...p, models: p.models.map(m => m.id === modelId ? { ...m, enabled } : m) })
}
