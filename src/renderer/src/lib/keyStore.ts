/**
 * keyStore.ts — API key storage encrypted via the OS credential store.
 *
 * Keys are encrypted by the main process using Electron safeStorage
 * (Keychain on macOS, DPAPI on Windows, libsecret on Linux) before
 * being written to localStorage. Decrypted values are held in an
 * in-memory cache so callers can read synchronously after init.
 *
 * Call initKeyStore() once at app startup (awaited) before any reads.
 * saveKey() is async (encrypts before writing).
 * loadKey() / loadAllKeys() are synchronous (read from cache).
 *
 * Migration: if an existing localStorage value fails decryption it is
 * treated as a legacy plaintext key, re-encrypted, and resaved.
 */

const PREFIX = 'manyai_key_'
const ENC_TAG = 'enc:'   // prefix distinguishes encrypted blobs from legacy plaintext

let cache: Record<string, string> = {}

/** Must be called once at app startup before any loadKey / loadAllKeys calls. */
export async function initKeyStore(): Promise<void> {
  cache = {}
  const entries: { storageKey: string; provider: string }[] = []

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) {
      entries.push({ storageKey: k, provider: k.slice(PREFIX.length) })
    }
  }

  await Promise.all(
    entries.map(async ({ storageKey, provider }) => {
      const stored = localStorage.getItem(storageKey)
      if (!stored) return

      if (stored.startsWith(ENC_TAG)) {
        // Normal encrypted path
        if (typeof window.api?.safeDecrypt !== 'function') {
          // IPC not available — skip, key will be missing until next rebuild
          return
        }
        const result = await window.api.safeDecrypt(stored.slice(ENC_TAG.length))
        if ('plaintext' in result && result.plaintext) {
          cache[provider] = result.plaintext
        }
      } else {
        // Legacy plaintext key — use immediately, migrate to encrypted if possible
        cache[provider] = stored
        if (typeof window.api?.safeEncrypt === 'function') {
          const encrypted = await window.api.safeEncrypt(stored)
          if ('ciphertext' in encrypted) {
            localStorage.setItem(storageKey, ENC_TAG + encrypted.ciphertext)
          }
        }
      }
    })
  )
}

export async function saveKey(provider: string, key: string): Promise<void> {
  const result = await window.api.safeEncrypt(key)
  if ('error' in result) {
    console.error('saveKey encrypt failed:', result.error)
    return
  }
  localStorage.setItem(`${PREFIX}${provider}`, ENC_TAG + result.ciphertext)
  cache[provider] = key
}

export function loadKey(provider: string): string | null {
  return cache[provider] ?? null
}

export function deleteKey(provider: string): void {
  localStorage.removeItem(`${PREFIX}${provider}`)
  delete cache[provider]
}

export function loadAllKeys(): Record<string, string> {
  return { ...cache }
}
