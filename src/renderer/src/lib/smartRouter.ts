/**
 * smartRouter.ts — Intelligent provider selection engine.
 *
 * Replaces the manual parallel chain when a workflow has `smartRouting: true`.
 * Scores providers by recent success rate and response latency, then routes
 * according to the configured mode.
 *
 * Modes:
 *   best-first — fire the highest-scored provider; fall back serially on failure
 *   serial     — fire providers one at a time in scored order; stop on first success
 *   parallel   — fire all capable providers simultaneously (like manual parallel)
 */

import { getAllProviders, getAllProviderOrder } from './providers'
import { loadAllKeys } from './keyStore'
import { loadEnabledProviders } from './providerPrefs'
import type { RouteEntry } from '../workflows'
import type { WorkflowType } from './workflowTypes'

// ── Config ────────────────────────────────────────────────────────────────────

export type SmartRoutingMode = 'best-first' | 'serial' | 'parallel'

export interface SmartRoutingConfig {
  mode: SmartRoutingMode
  fallbackEnabled: boolean
  maxParallel: number   // parallel mode: cap simultaneous providers (0 = unlimited)
}

const CONFIG_KEY = 'manyai_smart_routing_config'

const DEFAULT_CONFIG: SmartRoutingConfig = {
  mode: 'best-first',
  fallbackEnabled: true,
  maxParallel: 0,
}

// ── Routing log ───────────────────────────────────────────────────────────────

export interface RoutingLogEntry {
  ts: string
  workflowType: string
  provider: string
  model: string
  success: boolean
  latencyMs: number
  mode: SmartRoutingMode
}

const LOG_KEY = 'manyai_smart_routing_log'
const MAX_LOG = 300

// ── Public API ────────────────────────────────────────────────────────────────

export const smartRouter = {
  loadConfig(): SmartRoutingConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    } catch {}
    return { ...DEFAULT_CONFIG }
  },

  saveConfig(config: SmartRoutingConfig): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  },

  loadLog(): RoutingLogEntry[] {
    try {
      const raw = localStorage.getItem(LOG_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  },

  clearLog(): void {
    localStorage.removeItem(LOG_KEY)
  },

  recordOutcome(
    workflowType: string,
    provider: string,
    model: string,
    success: boolean,
    latencyMs: number,
  ): void {
    const config = this.loadConfig()
    const log = this.loadLog()
    log.unshift({
      ts: new Date().toISOString(),
      workflowType, provider, model, success, latencyMs,
      mode: config.mode,
    })
    if (log.length > MAX_LOG) log.length = MAX_LOG
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  },

  /**
   * Score a provider for a given workflow type.
   * Returns 0–1 where 1 is ideal.
   * Providers with no history get a neutral 0.5.
   */
  scoreProvider(workflowType: string, provider: string): number {
    const log = this.loadLog()
    const recent = log
      .filter(e => e.workflowType === workflowType && e.provider === provider)
      .slice(0, 20)
    if (recent.length === 0) return 0.5
    const successes = recent.filter(e => e.success)
    const successRate = successes.length / recent.length
    const avgLatency = successes.length > 0
      ? successes.reduce((s, e) => s + e.latencyMs, 0) / successes.length
      : 30000
    const speedScore = Math.max(0, 1 - avgLatency / 30000)
    return successRate * 0.7 + speedScore * 0.3
  },

  /**
   * Select providers for a workflow using smart routing.
   * Returns an ordered RouteEntry[] — callers honour mode themselves:
   *   parallel  → fire all
   *   best-first/serial → fire in order, stop on first success
   */
  selectProviders(workflowType: string, workflowTypes: WorkflowType[]): RouteEntry[] {
    const config = this.loadConfig()
    const allProviders = getAllProviders()
    const providerOrder = getAllProviderOrder()
    const keys = loadAllKeys()
    const enabledMap = loadEnabledProviders()

    const availableKeys = new Set(Object.keys(keys))
    availableKeys.add('pollinations')

    const capable: RouteEntry[] = providerOrder
      .filter(pk => {
        if (enabledMap[pk] === false) return false
        if (!availableKeys.has(pk)) return false
        const p = allProviders[pk]
        if (!p) return false
        return p.models.some(m =>
          workflowTypes.every(wt => (m.capabilities ?? ['chat']).includes(wt))
        )
      })
      .map(pk => {
        const p = allProviders[pk]
        const model = p.models
          .filter(m => workflowTypes.every(wt => (m.capabilities ?? ['chat']).includes(wt)))[0]
          ?.id ?? p.model
        return { provider: pk, model, instanceId: crypto.randomUUID() }
      })

    // Sort by score descending
    const scored = capable
      .map(r => ({ ...r, score: this.scoreProvider(workflowType, r.provider) }))
      .sort((a, b) => b.score - a.score)
      .map(({ score: _, ...r }) => r)

    if (config.mode === 'parallel' && config.maxParallel > 0) {
      return scored.slice(0, config.maxParallel)
    }

    return scored
  },
}
