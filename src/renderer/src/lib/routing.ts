/**
 * routing.ts — Task type detection and per-task provider routing prefs.
 */

import { ProviderKey, TaskType, PROVIDERS, ROUTING_ORDER } from './providers';
import type { ImageProvider } from './callImageProvider';

// ── Task type metadata ────────────────────────────────────────────────────────

export interface TaskMeta {
  label: string;
  icon: string;
  description: string;
  keywords: RegExp;
}

export const TASK_META: Record<TaskType, TaskMeta> = {
  image: {
    label: 'Image',
    icon: '🎨',
    description: 'Generate images from text descriptions',
    keywords: /\b(generate|create|draw|paint|render|image|picture|photo|illustration|artwork|portrait|landscape|design|logo|icon|visualize|imagine)\b.*\b(of|a|an|the|me|showing)\b|\b(image|picture|photo|illustration|artwork|painting|drawing) of\b/i,
  },
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

export const TASK_TYPES: TaskType[] = ['image', 'coding', 'reasoning', 'creative', 'summarization', 'translation', 'general'];

// ── Auto-detection ────────────────────────────────────────────────────────────

export function detectTaskType(prompt: string): TaskType {
  // Check image first (before creative, since "draw a story" etc could match both)
  if (TASK_META['image'].keywords.test(prompt)) return 'image';
  for (const t of TASK_TYPES) {
    if (t === 'general' || t === 'image') continue;
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
  routes: Partial<Record<TaskType, RouteEntry[]>>;  // ordered fallback chain, tried top-to-bottom
  imageProvider: ImageProvider;
}

const ROUTING_KEY = 'manyai_routing_prefs';

// Sensible defaults — free-tier providers matched to their strengths
// image is handled separately via imageProvider, but needs a placeholder entry
// Each entry is now an ordered array — system tries them top-to-bottom, skips unavailable ones
export const DEFAULT_ROUTES: Record<TaskType, RouteEntry[]> = {
  image:         [{ provider: 'pollinations', model: 'pollinations-image' }],
  coding:        [{ provider: 'mistral',   model: 'mistral-large-latest' },
                  { provider: 'openai',    model: 'gpt-4o' },
                  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' }],
  reasoning:     [{ provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct' },
                  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
                  { provider: 'openai',    model: 'gpt-4o' }],
  creative:      [{ provider: 'mistral',   model: 'mistral-small-latest' },
                  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
                  { provider: 'openai',    model: 'gpt-4o' }],
  summarization: [{ provider: 'gemini',    model: 'gemini-2.5-flash' },
                  { provider: 'cohere',    model: 'command-r-plus-08-2024' },
                  { provider: 'groq',      model: 'llama-3.3-70b-versatile' }],
  translation:   [{ provider: 'gemini',    model: 'gemini-2.5-flash' },
                  { provider: 'mistral',   model: 'mistral-large-latest' }],
  general:       [{ provider: 'cerebras',  model: 'llama3.1-8b' },
                  { provider: 'groq',      model: 'llama-3.1-8b-instant' },
                  { provider: 'pollinations', model: 'openai' }],
};

export function loadRoutingPrefs(): RoutingPrefs {
  const raw = localStorage.getItem(ROUTING_KEY);
  if (!raw) return { autoDetect: true, imageProvider: 'pollinations', routes: { ...DEFAULT_ROUTES } };
  try {
    const stored = JSON.parse(raw) as Partial<RoutingPrefs>;
    // Migrate old single-entry format to array if needed
    const routes: Partial<Record<TaskType, RouteEntry[]>> = {};
    for (const t of Object.keys(stored.routes ?? {}) as TaskType[]) {
      const v = stored.routes![t];
      routes[t] = Array.isArray(v) ? v : [v as unknown as RouteEntry];
    }
    return {
      autoDetect: stored.autoDetect ?? true,
      imageProvider: stored.imageProvider ?? 'pollinations',
      routes: { ...DEFAULT_ROUTES, ...routes },
    };
  } catch {
    return { autoDetect: true, imageProvider: 'pollinations', routes: { ...DEFAULT_ROUTES } };
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
  const isUsable = (pk: ProviderKey) =>
    (pk === 'pollinations' || availableKeys.has(pk)) && enabledProviders[pk] !== false;

  // Walk the user's configured chain first
  const chain = prefs.routes[taskType] ?? DEFAULT_ROUTES[taskType];
  for (const entry of chain) {
    if (isUsable(entry.provider)) return entry;
  }

  // Auto-fallback: providers with bestFor matching task type
  for (const k of ROUTING_ORDER) {
    if (!isUsable(k)) continue;
    if (PROVIDERS[k].bestFor.includes(taskType)) return { provider: k, model: PROVIDERS[k].model };
  }

  // Last resort: any available provider
  for (const k of ROUTING_ORDER) {
    if (isUsable(k)) return { provider: k, model: PROVIDERS[k].model };
  }

  return null;
}
