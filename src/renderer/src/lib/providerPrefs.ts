/**
 * providerPrefs.ts — Provider enabled state, priority order, and selected models.
 */

import { getAllProviders, getAllProviderOrder } from './providers';

const ORDER_KEY         = 'manyai_provider_order';
const ENABLED_KEY       = 'manyai_provider_enabled';
const MODELS_KEY        = 'manyai_provider_models';
const MODEL_ENABLED_KEY = 'manyai_model_enabled';

export function saveProviderOrder(order: string[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(order));
}

export function loadProviderOrder(): string[] {
  const raw = localStorage.getItem(ORDER_KEY);
  if (!raw) return getAllProviderOrder();
  try {
    const parsed = JSON.parse(raw) as string[];
    const allProviders = getAllProviders();
    const allOrder = getAllProviderOrder();
    const valid = parsed.filter(k => allProviders[k]);
    const extras = allOrder.filter(k => !valid.includes(k));
    return [...valid, ...extras];
  } catch {
    return getAllProviderOrder();
  }
}

export function saveEnabledProviders(enabled: Record<string, boolean>): void {
  localStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
}

export function loadEnabledProviders(): Record<string, boolean> {
  const raw = localStorage.getItem(ENABLED_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function saveSelectedModels(models: Partial<Record<string, string>>): void {
  localStorage.setItem(MODELS_KEY, JSON.stringify(models));
}

export function loadEnabledModels(): Record<string, boolean> {
  const raw = localStorage.getItem(MODEL_ENABLED_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function saveEnabledModels(enabled: Record<string, boolean>): void {
  localStorage.setItem(MODEL_ENABLED_KEY, JSON.stringify(enabled));
}

export function isModelEnabled(providerKey: string, modelId: string): boolean {
  const all = loadEnabledModels();
  return all[`${providerKey}:${modelId}`] !== false;
}

export function setModelEnabled(providerKey: string, modelId: string, enabled: boolean): void {
  const all = loadEnabledModels();
  all[`${providerKey}:${modelId}`] = enabled;
  saveEnabledModels(all);
}

export function loadSelectedModels(): Record<string, string> {
  const allProviders = getAllProviders();
  const defaults = Object.fromEntries(
    Object.entries(allProviders).map(([k, p]) => [k, p.model])
  );
  const raw = localStorage.getItem(MODELS_KEY);
  if (!raw) return defaults;
  try {
    const stored = JSON.parse(raw) as Partial<Record<string, string>>;
    const merged = { ...defaults };
    for (const [k, v] of Object.entries(stored)) {
      if (v && allProviders[k]?.models.some(m => m.id === v)) {
        merged[k] = v;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}
