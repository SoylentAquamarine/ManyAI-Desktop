/**
 * keyStore.ts — API key storage using localStorage (Electron desktop).
 */

import { ROUTING_ORDER, ProviderKey } from './providers';

const PREFIX = 'manyai_key_';

export function saveKey(provider: ProviderKey, key: string): void {
  localStorage.setItem(`${PREFIX}${provider}`, key);
}

export function loadKey(provider: ProviderKey): string | null {
  return localStorage.getItem(`${PREFIX}${provider}`);
}

export function deleteKey(provider: ProviderKey): void {
  localStorage.removeItem(`${PREFIX}${provider}`);
}

export function loadAllKeys(): Partial<Record<ProviderKey, string>> {
  const result: Partial<Record<ProviderKey, string>> = {};
  for (const p of ROUTING_ORDER.filter(k => k !== 'pollinations')) {
    const key = loadKey(p);
    if (key) result[p] = key;
  }
  return result;
}
