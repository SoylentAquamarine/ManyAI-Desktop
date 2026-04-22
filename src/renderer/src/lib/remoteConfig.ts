/**
 * remoteConfig.ts — Fetches provider/model overrides from GitHub.
 * Uses localStorage for caching (Electron desktop).
 */

const CONFIG_URL = 'https://raw.githubusercontent.com/SoylentAquamarine/ManyAI/main/public/config.json';
const CACHE_KEY  = 'manyai_remote_config_v1';

export interface RemoteModel { id: string; name: string; }
export interface RemoteProviderPatch { models?: RemoteModel[]; model?: string; disabled?: boolean; }
export interface RemoteConfig {
  version: number;
  fetchedAt?: number;
  providers?: Record<string, RemoteProviderPatch>;
}

export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  try {
    const res = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: RemoteConfig = await res.json();
    const stamped = { ...data, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(stamped));
    return stamped;
  } catch { return null; }
}

export async function getRemoteConfig(): Promise<RemoteConfig | null> {
  const fresh = await fetchRemoteConfig();
  if (fresh) return fresh;
  const raw = localStorage.getItem(CACHE_KEY);
  return raw ? JSON.parse(raw) : null;
}
