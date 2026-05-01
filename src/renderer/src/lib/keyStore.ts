/**
 * keyStore.ts — API key storage using localStorage (Electron desktop).
 */

const PREFIX = 'manyai_key_';

export function saveKey(provider: string, key: string): void {
  localStorage.setItem(`${PREFIX}${provider}`, key);
}

export function loadKey(provider: string): string | null {
  return localStorage.getItem(`${PREFIX}${provider}`);
}

export function deleteKey(provider: string): void {
  localStorage.removeItem(`${PREFIX}${provider}`);
}

export function loadAllKeys(): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) {
      const providerKey = k.slice(PREFIX.length);
      const val = localStorage.getItem(k);
      if (val) result[providerKey] = val;
    }
  }
  return result;
}
