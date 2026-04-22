/**
 * providerPrefs.ts — Provider enabled state, priority order, and selected models.
 * Uses localStorage for Electron desktop.
 */

import { ROUTING_ORDER, PROVIDERS, ProviderKey } from './providers';

const ORDER_KEY        = 'manyai_provider_order';
const ENABLED_KEY      = 'manyai_provider_enabled';
const MODELS_KEY       = 'manyai_provider_models';
const MODEL_ENABLED_KEY = 'manyai_model_enabled'; // "providerKey:modelId" -> boolean

export function saveProviderOrder(order: ProviderKey[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

export function loadProviderOrder(): ProviderKey[] {
  const raw = localStorage.getItem(ORDER_KEY);
  if (!raw) return [...ROUTING_ORDER];
  try {
    const parsed = JSON.parse(raw) as ProviderKey[];
    const extras = ROUTING_ORDER.filter(k => !parsed.includes(k));
    return [...parsed, ...extras];
  } catch {
    return [...ROUTING_ORDER];
  }
}

export function saveEnabledProviders(enabled: Record<ProviderKey, boolean>): void {
  localStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
}

export function loadEnabledProviders(): Record<ProviderKey, boolean> {
  const defaults = Object.fromEntries(ROUTING_ORDER.map(k => [k, true])) as Record<ProviderKey, boolean>;
  const raw = localStorage.getItem(ENABLED_KEY);
  if (!raw) return defaults;
  try {
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSelectedModels(models: Partial<Record<ProviderKey, string>>): void {
  localStorage.setItem(MODELS_KEY, JSON.stringify(models));
}

// Per-model enabled state — key is "providerKey:modelId"
export function loadEnabledModels(): Record<string, boolean> {
  const raw = localStorage.getItem(MODEL_ENABLED_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function saveEnabledModels(enabled: Record<string, boolean>): void {
  localStorage.setItem(MODEL_ENABLED_KEY, JSON.stringify(enabled));
}

export function isModelEnabled(providerKey: ProviderKey, modelId: string): boolean {
  const all = loadEnabledModels();
  const k = `${providerKey}:${modelId}`;
  return all[k] !== false; // default true
}

export function setModelEnabled(providerKey: ProviderKey, modelId: string, enabled: boolean): void {
  const all = loadEnabledModels();
  all[`${providerKey}:${modelId}`] = enabled;
  saveEnabledModels(all);
}

export function loadSelectedModels(): Record<ProviderKey, string> {
  const defaults = Object.fromEntries(
    ROUTING_ORDER.map(k => [k, PROVIDERS[k].model])
  ) as Record<ProviderKey, string>;
  const raw = localStorage.getItem(MODELS_KEY);
  if (!raw) return defaults;
  try {
    const stored = JSON.parse(raw) as Partial<Record<ProviderKey, string>>;
    const merged = { ...defaults };
    for (const k of ROUTING_ORDER) {
      const storedModel = stored[k];
      if (storedModel && PROVIDERS[k].models.some(m => m.id === storedModel)) {
        merged[k] = storedModel;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}
