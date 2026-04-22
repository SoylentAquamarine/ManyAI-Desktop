/**
 * routing.ts — Task type detection and per-task provider routing prefs.
 */

import { ProviderKey, TaskType, PROVIDERS, ROUTING_ORDER } from './providers';

// ── Task type metadata ────────────────────────────────────────────────────────

export interface TaskMeta {
  label: string;
  icon: string;
  description: string;
  keywords: RegExp;
}

export const TASK_META: Record<TaskType, TaskMeta> = {
  coding: {
    label: 'Code',
    icon: '💻',
    description: 'Code generation, debugging, explaining code',
    keywords: /\b(code|function|bug|debug|error|program|script|class|method|variable|python|javascript|typescript|java|c\+\+|sql|html|css|api|npm|array|loop|syntax|compile|runtime|refactor|algorithm|regex|json|xml)\b/i,
  },
  reasoning: {
    label: 'Reasoning',
    icon: '🧠',
    description: 'Math, logic, analysis, step-by-step thinking',
    keywords: /\b(calculate|solve|math|equation|logic|proof|analyze|analysis|deduce|infer|probability|statistic|step.by.step|reason|explain why|how does|what is the difference)\b/i,
  },
  creative: {
    label: 'Creative',
    icon: '✍️',
    description: 'Stories, poems, brainstorming, creative writing',
    keywords: /\b(write a story|poem|creative|imagine|fiction|novel|narrative|character|plot|lyrics|haiku|essay|brainstorm|invent|fantasy|roleplay)\b/i,
  },
  summarization: {
    label: 'Summarize',
    icon: '📋',
    description: 'Summarizing documents, extracting key points',
    keywords: /\b(summarize|summary|tldr|tl;dr|brief|condense|shorten|overview|key points|main points|digest)\b/i,
  },
  translation: {
    label: 'Translate',
    icon: '🌐',
    description: 'Language translation',
    keywords: /\b(translate|translation|in spanish|in french|in german|in japanese|in chinese|in arabic|in portuguese|in italian|in russian|in korean|en español|en français|auf deutsch)\b/i,
  },
  general: {
    label: 'General',
    icon: '💬',
    description: 'Everything else — Q&A, chat, information',
    keywords: /./,  // fallback — always matches
  },
};

export const TASK_TYPES: TaskType[] = ['coding', 'reasoning', 'creative', 'summarization', 'translation', 'general'];

// ── Auto-detection ────────────────────────────────────────────────────────────

export function detectTaskType(prompt: string): TaskType {
  for (const t of TASK_TYPES) {
    if (t === 'general') continue;
    if (TASK_META[t].keywords.test(prompt)) return t;
  }
  return 'general';
}

// ── Routing preferences ───────────────────────────────────────────────────────

export interface RouteEntry {
  provider: ProviderKey;
  model: string;
}

export interface RoutingPrefs {
  autoDetect: boolean;
  routes: Partial<Record<TaskType, RouteEntry>>;
}

const ROUTING_KEY = 'manyai_routing_prefs';

// Sensible defaults — free-tier providers matched to their strengths
export const DEFAULT_ROUTES: Record<TaskType, RouteEntry> = {
  coding:        { provider: 'mistral',    model: 'mistral-large-latest' },
  reasoning:     { provider: 'sambanova',  model: 'Meta-Llama-3.3-70B-Instruct' },
  creative:      { provider: 'mistral',    model: 'mistral-small-latest' },
  summarization: { provider: 'gemini',     model: 'gemini-2.5-flash' },
  translation:   { provider: 'gemini',     model: 'gemini-2.5-flash' },
  general:       { provider: 'cerebras',   model: 'llama3.1-8b' },
};

export function loadRoutingPrefs(): RoutingPrefs {
  const raw = localStorage.getItem(ROUTING_KEY);
  if (!raw) return { autoDetect: true, routes: { ...DEFAULT_ROUTES } };
  try {
    const stored = JSON.parse(raw) as Partial<RoutingPrefs>;
    return {
      autoDetect: stored.autoDetect ?? true,
      routes: { ...DEFAULT_ROUTES, ...(stored.routes ?? {}) },
    };
  } catch {
    return { autoDetect: true, routes: { ...DEFAULT_ROUTES } };
  }
}

export function saveRoutingPrefs(prefs: RoutingPrefs): void {
  localStorage.setItem(ROUTING_KEY, JSON.stringify(prefs));
}

/**
 * Given a task type and the user's stored prefs + available keys,
 * return the best provider+model to use.
 * Falls back to the first available provider in ROUTING_ORDER.
 */
export function resolveProvider(
  taskType: TaskType,
  prefs: RoutingPrefs,
  availableKeys: Set<ProviderKey>,
  enabledProviders: Partial<Record<ProviderKey, boolean>>,
): RouteEntry | null {
  const route = prefs.routes[taskType] ?? DEFAULT_ROUTES[taskType];

  // Use preferred route if provider is available
  const pk = route.provider;
  const isAvailable = pk === 'pollinations' || availableKeys.has(pk);
  const isEnabled = enabledProviders[pk] !== false;
  if (isAvailable && isEnabled) {
    return route;
  }

  // Fall back: find first available provider that's good at this task type
  for (const k of ROUTING_ORDER) {
    const p = PROVIDERS[k];
    const avail = k === 'pollinations' || availableKeys.has(k);
    if (!avail || enabledProviders[k] === false) continue;
    if (p.bestFor.includes(taskType)) {
      return { provider: k, model: p.model };
    }
  }

  // Last resort: any available provider
  for (const k of ROUTING_ORDER) {
    const avail = k === 'pollinations' || availableKeys.has(k);
    if (avail && enabledProviders[k] !== false) {
      return { provider: k, model: PROVIDERS[k].model };
    }
  }

  return null;
}
