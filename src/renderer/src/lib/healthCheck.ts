/**
 * healthCheck.ts — Provider health monitoring.
 *
 * Runs lightweight test calls to each enabled provider, records results,
 * and exposes summary data consumed by both the Health screen and the
 * smart router's scoring logic.
 *
 * Health results live in localStorage (manyai_health_log) and are separate
 * from the smart routing log so neither pollutes the other's dataset.
 */

import { getAllProviders, getAllProviderOrder } from './providers'
import { loadAllKeys } from './keyStore'
import { loadEnabledProviders } from './providerPrefs'
import { callProvider } from './callProvider'
import { logger } from './logger'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthResult {
  ts: string
  provider: string
  model: string
  success: boolean
  latencyMs: number
  error?: string
}

export interface HealthConfig {
  continuousEnabled: boolean
  intervalMinutes: number
}

export type ProviderStatus = 'healthy' | 'degraded' | 'down' | 'unknown'

export interface ProviderSummary {
  provider: string
  name: string
  model: string
  status: ProviderStatus
  lastChecked: string | null
  lastLatencyMs: number | null
  recentSuccessRate: number | null
  lastError?: string
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const LOG_KEY    = 'manyai_health_log'
const CONFIG_KEY = 'manyai_health_config'
const MAX_LOG    = 500

const DEFAULT_CONFIG: HealthConfig = {
  continuousEnabled: false,
  intervalMinutes: 60,
}

// ── Core API ──────────────────────────────────────────────────────────────────

export const healthCheck = {
  loadConfig(): HealthConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    } catch {}
    return { ...DEFAULT_CONFIG }
  },

  saveConfig(config: HealthConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  },

  loadLog(): HealthResult[] {
    try {
      const raw = localStorage.getItem(LOG_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  },

  clearLog(): void {
    localStorage.removeItem(LOG_KEY)
  },

  recordResult(result: HealthResult): void {
    const log = this.loadLog()
    log.unshift(result)
    if (log.length > MAX_LOG) log.length = MAX_LOG
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  },

  /** Run a single provider health check. Uses the first chat-capable model. */
  async checkProvider(providerKey: string): Promise<HealthResult> {
    const allProviders = getAllProviders()
    const keys = loadAllKeys()
    const p = allProviders[providerKey]
    if (!p) return { ts: new Date().toISOString(), provider: providerKey, model: '', success: false, latencyMs: 0, error: 'Provider not found' }

    const model = (p.models.find(m => (m.capabilities ?? ['chat']).includes('chat'))?.id) ?? p.model
    const t0 = Date.now()
    try {
      const result = await callProvider(
        { ...p, model },
        'Reply with the single word "ok" and nothing else.',
        keys[providerKey] ?? '',
      )
      const latencyMs = result.latencyMs ?? (Date.now() - t0)
      const entry: HealthResult = {
        ts: new Date().toISOString(),
        provider: providerKey,
        model,
        success: !result.error,
        latencyMs,
        error: result.error,
      }
      this.recordResult(entry)
      logger.info(`Health check: ${providerKey}`, { success: entry.success, latencyMs, model })
      return entry
    } catch (e) {
      const latencyMs = Date.now() - t0
      const entry: HealthResult = {
        ts: new Date().toISOString(),
        provider: providerKey,
        model,
        success: false,
        latencyMs,
        error: e instanceof Error ? e.message : String(e),
      }
      this.recordResult(entry)
      logger.error(`Health check failed: ${providerKey}`, { error: entry.error })
      return entry
    }
  },

  /** Run health checks on all enabled providers with available keys. Sequential to avoid hammering. */
  async checkAll(onProgress?: (done: number, total: number, latest: HealthResult) => void): Promise<HealthResult[]> {
    const allProviders = getAllProviders()
    const providerOrder = getAllProviderOrder()
    const keys = loadAllKeys()
    const enabledMap = loadEnabledProviders()
    const availableKeys = new Set(Object.keys(keys))
    availableKeys.add('pollinations')

    const targets = providerOrder.filter(pk =>
      availableKeys.has(pk) && enabledMap[pk] !== false && !!allProviders[pk]
    )

    const results: HealthResult[] = []
    for (let i = 0; i < targets.length; i++) {
      const result = await this.checkProvider(targets[i])
      results.push(result)
      onProgress?.(i + 1, targets.length, result)
    }
    return results
  },

  /** Build a per-provider summary from the current log. */
  getSummaries(): ProviderSummary[] {
    const allProviders = getAllProviders()
    const providerOrder = getAllProviderOrder()
    const keys = loadAllKeys()
    const enabledMap = loadEnabledProviders()
    const availableKeys = new Set(Object.keys(keys))
    availableKeys.add('pollinations')
    const log = this.loadLog()

    return providerOrder
      .filter(pk => availableKeys.has(pk) && enabledMap[pk] !== false && !!allProviders[pk])
      .map(pk => {
        const p = allProviders[pk]
        const model = (p.models.find(m => (m.capabilities ?? ['chat']).includes('chat'))?.id) ?? p.model
        const recent = log.filter(e => e.provider === pk).slice(0, 10)
        const last = recent[0] ?? null

        let status: ProviderStatus = 'unknown'
        if (recent.length > 0) {
          const rate = recent.filter(e => e.success).length / recent.length
          if (!last?.success) status = 'down'
          else if (rate >= 0.8) status = 'healthy'
          else status = 'degraded'
        }

        return {
          provider: pk,
          name: p.name,
          model,
          status,
          lastChecked: last?.ts ?? null,
          lastLatencyMs: last?.latencyMs ?? null,
          recentSuccessRate: recent.length > 0 ? recent.filter(e => e.success).length / recent.length : null,
          lastError: last?.error,
        }
      })
  },

  /**
   * Health penalty for smart router scoring: 0 (healthy) → 0.3 (down).
   * Called by smartRouter.scoreProvider to penalize unreliable providers.
   */
  getPenalty(providerKey: string): number {
    const log = this.loadLog()
    const recent = log.filter(e => e.provider === providerKey).slice(0, 5)
    if (recent.length === 0) return 0
    const failRate = recent.filter(e => !e.success).length / recent.length
    return failRate * 0.3
  },
}
