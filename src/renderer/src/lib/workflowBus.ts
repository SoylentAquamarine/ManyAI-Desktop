/**
 * workflowBus.ts — Central pub/sub bus for cross-workflow data routing.
 *
 * This is the seed of the ManyAI workflow engine. It keeps data sources
 * (RSS, IRC, future: Slack, webhooks, etc.) fully decoupled from consumers
 * (chat workflows, summarization, logging, etc.).
 *
 * Usage:
 *   // Publisher (e.g. RssScreen)
 *   workflowBus.publish({ targetTabId: 'tab-123', payload: { ... } })
 *
 *   // Consumer (App.tsx)
 *   const unsub = workflowBus.subscribe(event => { ... })
 *   // call unsub() to clean up
 *
 * Growth path:
 *   - Add transformation steps between publish and deliver
 *   - Add routing rules (e.g. "all RSS → summarization tab")
 *   - Add a queue for rate-limiting or batching
 *   - Add persistence for replay / audit log
 */

// ── Normalized payload ────────────────────────────────────────────────────────

/**
 * The common data format for all cross-workflow content.
 * Every source (RSS, IRC, chat) normalizes its output into this shape
 * before publishing. Consumers never need to know the source type.
 */
export interface WorkflowPayload {
  /** Where the data came from: 'rss' | 'irc' | 'chat' | etc. */
  source: string
  /** ISO 8601 timestamp of the original content */
  timestamp: string
  /** Semantic content type */
  contentType: 'article' | 'message' | 'text' | 'event'
  /** The primary text content to inject into the target workflow */
  content: string
  /** Optional human-readable title (article headline, IRC channel, etc.) */
  title?: string
  /** Original URL or source reference */
  url?: string
  /** Source-specific extra data — does not affect routing */
  metadata?: Record<string, unknown>
}

// ── Bus event ─────────────────────────────────────────────────────────────────

export interface WorkflowBusEvent {
  /** Tab ID to receive this payload, or 'active' for whichever tab is currently visible */
  targetTabId: string
  /**
   * Route by workflow type instead of a specific tab ID.
   * App.tsx finds the first open tab with this workflowType and injects there.
   * When set, targetTabId is ignored.
   */
  targetWorkflowType?: string
  payload: WorkflowPayload
}

// ── Internal state ────────────────────────────────────────────────────────────

type BusHandler = (event: WorkflowBusEvent) => void
const handlers = new Set<BusHandler>()

// ── Public API ────────────────────────────────────────────────────────────────

export const workflowBus = {
  /**
   * Publish a payload to the bus. All active subscribers are called synchronously.
   * Routing to the actual tab is handled by the App-level subscriber.
   */
  publish(event: WorkflowBusEvent): void {
    handlers.forEach(h => {
      try { h(event) } catch (e) { console.error('[workflowBus] handler error', e) }
    })
  },

  /**
   * Subscribe to all bus events. Returns an unsubscribe function — call it
   * in useEffect cleanup to avoid memory leaks.
   */
  subscribe(handler: BusHandler): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  },

  /** Current subscriber count — useful for debugging. */
  get size(): number { return handlers.size },
}
