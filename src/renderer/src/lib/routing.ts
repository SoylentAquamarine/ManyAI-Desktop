/**
 * routing.ts — Task type detection and per-task provider routing prefs.
 * All workflow definitions live in src/workflows/ — do not add types here.
 */

import { TaskType, getAllProviders } from './providers';
import { WORKFLOW_REGISTRY } from '../workflows';
export type { RouteEntry } from '../workflows';

// ── Derived from registry ─────────────────────────────────────────────────────

export interface TaskMeta {
  label: string;
  icon: string;
  description: string;
  keywords: RegExp;
}

export const TASK_META: Record<string, TaskMeta> = Object.fromEntries(
  WORKFLOW_REGISTRY.map(w => [w.type, {
    label: w.label,
    icon: w.icon,
    description: w.description,
    keywords: w.keywords,
  }])
);

export const TASK_TYPES: string[] = WORKFLOW_REGISTRY.map(w => w.type);

export const DEFAULT_ROUTES: Record<string, import('../workflows').RouteEntry[]> = Object.fromEntries(
  WORKFLOW_REGISTRY.map(w => [w.type, w.defaultRoutes])
);

// ── Auto-detection ────────────────────────────────────────────────────────────

export function detectTaskType(prompt: string): TaskType {
  // isImage plugins first (prevent bleed into creative)
  for (const w of WORKFLOW_REGISTRY) {
    if (w.isImage && w.keywords.test(prompt)) return w.type;
  }
  for (const w of WORKFLOW_REGISTRY) {
    if (w.type === 'general' || w.isImage) continue;
    if (w.keywords.test(prompt)) return w.type;
  }
  return 'general';
}

// ── Routing preferences ───────────────────────────────────────────────────────

export interface RoutingPrefs {
  autoDetect: boolean;
  routes: Record<string, import('../workflows').RouteEntry[]>;
}

const ROUTING_KEY = 'manyai_routing_prefs';

export function loadRoutingPrefs(): RoutingPrefs {
  const raw = localStorage.getItem(ROUTING_KEY);
  if (!raw) return { autoDetect: true, routes: { ...DEFAULT_ROUTES } };
  try {
    const stored = JSON.parse(raw) as Partial<RoutingPrefs> & {
      imageProvider?: string;
      imageProviders?: unknown[];
    };
    const routes: Record<string, import('../workflows').RouteEntry[]> = {};
    for (const t of Object.keys(stored.routes ?? {})) {
      const v = stored.routes![t];
      routes[t] = Array.isArray(v) ? v : [v as unknown as import('../workflows').RouteEntry];
    }
    // Migrate old imageProviders field → routes['image']
    if (stored.imageProviders && !routes['image']) {
      routes['image'] = (stored.imageProviders as unknown[]).map((p: unknown) => {
        if (typeof p === 'string') {
          const provider = p === 'openai-dalle' ? 'openai' : p;
          const model = p === 'openai-dalle' ? 'dall-e-3' : 'flux';
          return { provider, model, enabled: true };
        }
        const entry = p as Record<string, unknown>;
        const id = String(entry.id ?? entry.provider ?? 'pollinations');
        const provider = id === 'openai-dalle' ? 'openai' : id;
        const model = String(entry.model ?? (provider === 'openai' ? 'dall-e-3' : 'flux'));
        return { provider, model, enabled: entry.enabled !== false };
      });
    } else if (stored.imageProvider && !routes['image']) {
      const id = stored.imageProvider === 'openai-dalle' ? 'openai' : stored.imageProvider;
      routes['image'] = [{ provider: id, model: id === 'openai' ? 'dall-e-3' : 'flux', enabled: true }];
    }
    return {
      autoDetect: stored.autoDetect ?? true,
      routes: { ...DEFAULT_ROUTES, ...routes },
    };
  } catch {
    return { autoDetect: true, routes: { ...DEFAULT_ROUTES } };
  }
}

export function saveRoutingPrefs(prefs: RoutingPrefs): void {
  localStorage.setItem(ROUTING_KEY, JSON.stringify(prefs));
}

export function resolveProvider(
  taskType: TaskType,
  prefs: RoutingPrefs,
  availableKeys: Set<string>,
  enabledProviders: Partial<Record<string, boolean>>,
): import('../workflows').RouteEntry | null {
  const isUsable = (pk: string) =>
    (pk === 'pollinations' || availableKeys.has(pk)) && enabledProviders[pk] !== false;

  const isImageTask = WORKFLOW_REGISTRY.find(w => w.type === taskType)?.isImage ?? false;
  const allProviders = getAllProviders();

  const chain = prefs.routes[taskType] ?? DEFAULT_ROUTES[taskType] ?? DEFAULT_ROUTES['general'];
  for (const entry of chain) {
    if (entry.enabled !== false && isUsable(entry.provider)) {
      const model = allProviders[entry.provider]?.models.find(m => m.id === entry.model);
      if (model?.supportsImageGen && !isImageTask) continue;
      return entry;
    }
  }

  // No configured route available — check if pollinations is usable as last resort
  const allProviders = getAllProviders();
  if (allProviders['pollinations'] && isUsable('pollinations')) {
    return { provider: 'pollinations', model: allProviders['pollinations'].model };
  }

  return null;
}
