/**
 * routing.ts — Task type detection and per-task provider routing prefs.
 * All workflow definitions live in src/workflows/ — do not add types here.
 * Provider selection is capability-based: model.capabilities must include the workflow's workflowType.
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

const FIRST_CHAT_TYPE = WORKFLOW_REGISTRY.find(w => w.workflowType.includes('chat'))?.type ?? 'coding';

// ── Routing preferences ───────────────────────────────────────────────────────

export interface RoutingPrefs {
  routes: Record<string, import('../workflows').RouteEntry[]>;
}

const ROUTING_KEY = 'manyai_routing_prefs';

export function loadRoutingPrefs(): RoutingPrefs {
  const raw = localStorage.getItem(ROUTING_KEY);
  if (!raw) return { routes: { ...DEFAULT_ROUTES } };
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
    return { routes: { ...DEFAULT_ROUTES, ...routes } };
  } catch {
    return { routes: { ...DEFAULT_ROUTES } };
  }
}

export function saveRoutingPrefs(prefs: RoutingPrefs): void {
  localStorage.setItem(ROUTING_KEY, JSON.stringify(prefs));
}

export function resolveAllProviders(
  taskType: TaskType,
  prefs: RoutingPrefs,
  availableKeys: Set<string>,
  enabledProviders: Partial<Record<string, boolean>>,
): import('../workflows').RouteEntry[] {
  const isUsable = (pk: string) =>
    (pk === 'pollinations' || availableKeys.has(pk)) && enabledProviders[pk] !== false;

  const workflowTypes = WORKFLOW_REGISTRY.find(w => w.type === taskType)?.workflowType ?? ['chat'];
  const allProviders = getAllProviders();
  const modelCapable = (caps: string[] | undefined) =>
    workflowTypes.every(wt => (caps ?? ['chat']).includes(wt));

  const chain = prefs.routes[taskType] ?? DEFAULT_ROUTES[taskType] ?? DEFAULT_ROUTES[FIRST_CHAT_TYPE] ?? [];
  return chain.filter(entry => {
    if (entry.enabled === false) return false;
    if (!isUsable(entry.provider)) return false;
    const model = allProviders[entry.provider]?.models.find(m => m.id === entry.model);
    return modelCapable(model?.capabilities);
  });
}

export function resolveProvider(
  taskType: TaskType,
  prefs: RoutingPrefs,
  availableKeys: Set<string>,
  enabledProviders: Partial<Record<string, boolean>>,
): import('../workflows').RouteEntry | null {
  const isUsable = (pk: string) =>
    (pk === 'pollinations' || availableKeys.has(pk)) && enabledProviders[pk] !== false;

  const workflowTypes = WORKFLOW_REGISTRY.find(w => w.type === taskType)?.workflowType ?? ['chat'];
  const allProviders = getAllProviders();

  // A model satisfies a workflow if its capabilities include ALL of the workflow's types
  const modelCapable = (caps: string[] | undefined) =>
    workflowTypes.every(wt => (caps ?? ['chat']).includes(wt));

  const chain = prefs.routes[taskType] ?? DEFAULT_ROUTES[taskType] ?? DEFAULT_ROUTES[FIRST_CHAT_TYPE] ?? [];
  for (const entry of chain) {
    if (entry.enabled !== false && isUsable(entry.provider)) {
      const model = allProviders[entry.provider]?.models.find(m => m.id === entry.model);
      if (!modelCapable(model?.capabilities)) continue;
      return entry;
    }
  }

  // No configured route — fall back to a capable pollinations model
  const pollinations = allProviders['pollinations'];
  if (pollinations && isUsable('pollinations')) {
    const fallbackModel = pollinations.models.find(m => modelCapable(m.capabilities));
    if (fallbackModel) return { provider: 'pollinations', model: fallbackModel.id };
  }

  return null;
}
