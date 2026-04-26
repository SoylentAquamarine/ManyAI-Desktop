/**
 * crypto.ts — AES-GCM encryption helpers using the Web Crypto API.
 *
 * Keys are derived from a user-supplied password via PBKDF2 (SHA-256,
 * 200 000 iterations). Each call to encryptText produces a fresh random
 * salt (16 bytes) and IV (12 bytes), so the same plaintext + password
 * always yields a different ciphertext — safe to store in backup files.
 *
 * The encoded output is base64(salt[16] || iv[12] || ciphertext).
 *
 * Usage:
 *   const blob = await encryptText(JSON.stringify(apiKeys), password)
 *   const plain = await decryptText(blob, password)  // throws on wrong password
 */

const PBKDF2_ITERATIONS = 200_000
const KEY_LENGTH_BITS   = 256

/** Derive an AES-GCM CryptoKey from a password + salt using PBKDF2. */
async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const rawKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    rawKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    [usage],
  )
}

/**
 * Encrypt plaintext with a password.
 * Returns a base64 string that can be safely stored in a JSON backup.
 */
export async function encryptText(plaintext: string, password: string): Promise<string> {
  const enc  = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>
  const iv   = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>

  const key        = await deriveKey(password, salt, 'encrypt')
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext),
  )

  // Pack: salt(16) + iv(12) + ciphertext → base64
  const combined = new Uint8Array(16 + 12 + ciphertext.byteLength)
  combined.set(salt, 0)
  combined.set(iv, 16)
  combined.set(new Uint8Array(ciphertext), 28)
  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt a base64 blob produced by encryptText.
 * Throws if the password is wrong (AES-GCM authentication tag mismatch)
 * or the input is malformed.
 */
export async function decryptText(encoded: string, password: string): Promise<string> {
  const combined   = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>
  const salt       = combined.slice(0, 16)  as Uint8Array<ArrayBuffer>
  const iv         = combined.slice(16, 28) as Uint8Array<ArrayBuffer>
  const ciphertext = combined.slice(28)

  const key       = await deriveKey(password, salt, 'decrypt')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}
