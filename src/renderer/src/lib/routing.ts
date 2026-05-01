/**
 * routing.ts — Task type detection and per-task provider routing prefs.
 * All workflow definitions live in src/workflows/ — do not add types here.
 * Provider selection is capability-based: model.capabilities must include the workflow's workflowType.
 */

import { TaskType, getAllProviders, getKeylessProviderKeys } from './providers';
import { WORKFLOW_REGISTRY } from '../workflows';
import { loadWorkflows, upsertCustomWorkflow } from './workflows';
export type { RouteEntry } from '../workflows';

// ── Derived from registry ─────────────────────────────────────────────────────

export interface TaskMeta {
  label: string;
  icon: string;
  description: string;
}

export const TASK_META: Record<string, TaskMeta> = Object.fromEntries(
  WORKFLOW_REGISTRY.map(w => [w.type, {
    label: w.label,
    icon: w.icon,
    description: w.description,
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
  // Determine which workflow types are custom (routes live in their JSON files)
  const allWorkflows = loadWorkflows()
  const customTypes = new Set(allWorkflows.filter(w => !w.builtIn).map(w => w.type))

  const raw = localStorage.getItem(ROUTING_KEY);
  let routes: Record<string, import('../workflows').RouteEntry[]> = {};

  if (raw) {
    try {
      const stored = JSON.parse(raw) as Partial<RoutingPrefs> & {
        imageProvider?: string;
        imageProviders?: unknown[];
      };
      for (const t of Object.keys(stored.routes ?? {})) {
        if (customTypes.has(t)) continue // custom routes come from workflow files
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
          const id = String(entry.id ?? entry.provider ?? '');
          const provider = id === 'openai-dalle' ? 'openai' : id;
          const model = String(entry.model ?? (provider === 'openai' ? 'dall-e-3' : 'flux'));
          return { provider, model, enabled: entry.enabled !== false };
        });
      } else if (stored.imageProvider && !routes['image']) {
        const id = stored.imageProvider === 'openai-dalle' ? 'openai' : stored.imageProvider;
        routes['image'] = [{ provider: id, model: id === 'openai' ? 'dall-e-3' : 'flux', enabled: true }];
      }
    } catch { /* fall through to defaults */ }
  }

  // Merge in DEFAULT_ROUTES for any builtin types not yet stored
  const merged: Record<string, import('../workflows').RouteEntry[]> = { ...DEFAULT_ROUTES }
  for (const [t, v] of Object.entries(routes)) {
    merged[t] = v
  }

  // Pull custom workflow routes from their JSON files
  for (const w of allWorkflows.filter(wf => !wf.builtIn)) {
    if (w.routes) {
      merged[w.type] = w.routes
    } else if (!merged[w.type]) {
      merged[w.type] = []
    }
  }

  // Assign stable instanceIds where missing, persist if anything changed
  let needsSave = false
  for (const t of Object.keys(merged)) {
    merged[t] = merged[t].map(e => {
      if (e.instanceId) return e
      needsSave = true
      return { ...e, instanceId: crypto.randomUUID() }
    })
  }
  if (needsSave) {
    _saveBuiltinRoutes(merged, customTypes)
  }

  return { routes: merged };
}

function _saveBuiltinRoutes(
  routes: Record<string, import('../workflows').RouteEntry[]>,
  customTypes: Set<string>,
): void {
  const builtinOnly = Object.fromEntries(
    Object.entries(routes).filter(([t]) => !customTypes.has(t))
  )
  localStorage.setItem(ROUTING_KEY, JSON.stringify({ routes: builtinOnly }))
}

export function saveRoutingPrefs(prefs: RoutingPrefs): void {
  const allWorkflows = loadWorkflows()
  const customTypes = new Set(allWorkflows.filter(w => !w.builtIn).map(w => w.type))

  // Write custom workflow routes to their JSON files
  for (const w of allWorkflows.filter(wf => !wf.builtIn)) {
    const routes = prefs.routes[w.type]
    if (routes !== undefined) {
      upsertCustomWorkflow({ ...w, routes })
    }
  }

  // Write builtin routes to localStorage
  _saveBuiltinRoutes(prefs.routes, customTypes)
}

export function resolveAllProviders(
  taskType: TaskType,
  prefs: RoutingPrefs,
  availableKeys: Set<string>,
  enabledProviders: Partial<Record<string, boolean>>,
): import('../workflows').RouteEntry[] {
  const keylessKeys = new Set(getKeylessProviderKeys())
  const isUsable = (pk: string) =>
    (keylessKeys.has(pk) || availableKeys.has(pk)) && enabledProviders[pk] !== false;

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
  const keylessKeys = new Set(getKeylessProviderKeys())
  const isUsable = (pk: string) =>
    (keylessKeys.has(pk) || availableKeys.has(pk)) && enabledProviders[pk] !== false;

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

  // No configured route — fall back to any capable keyless provider
  for (const pk of getKeylessProviderKeys()) {
    const p = allProviders[pk]
    if (!p || isUsable(pk) === false) continue
    const fallbackModel = p.models.find(m => modelCapable(m.capabilities))
    if (fallbackModel) return { provider: pk, model: fallbackModel.id }
  }

  return null;
}
