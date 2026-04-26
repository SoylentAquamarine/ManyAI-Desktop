/**
 * providers.ts — Provider registry and routing logic for ManyAI.
 *
 * paidOnly: true  = credit card required to sign up
 * paidOnly: false = free tier available, no credit card needed
 *
 * Model list is also patched at runtime by remoteConfig.ts —
 * edit stevepleasants.com/manyai/config.json to add/remove models without a build.
 */

import type { WorkflowType } from './workflowTypes'

export type ProviderKey = string;

export type TaskType = string;

export interface ProviderModel {
  id: string;
  name: string;
  /** Workflow types this model can handle. Omit to inherit nothing (shown in all chat routes). */
  capabilities?: WorkflowType[];
  /** Max tokens to request. Defaults to 1024 if omitted. */
  maxTokens?: number;
  /** Image generation size, e.g. "1024x1024". Defaults to "1024x1024". */
  imageSize?: string;
  /** Append a random seed to each image request to bypass provider-side caching. */
  randomSeed?: boolean;
}

export interface Provider {
  key: ProviderKey;
  name: string;
  model: string;
  models: ProviderModel[];
  baseUrl: string;
  needsKey: boolean;
  paidOnly: boolean;           // true = credit card required to sign up
  color: string;
  bestFor: TaskType[];
  goodAt: string;
  notGreatAt: string;
  supportsVision: boolean;
  instructionsUrl: string;     // URL shown in "How to Get Keys" screen
  extraHeaders?: Record<string, string>; // Extra headers sent with every request
  keyHint?: string;            // Shown in API Keys screen to explain key format
}

export const PROVIDERS: Record<ProviderKey, Provider> = {

  // ── Free tier (no credit card) ─────────────────────────────────────────────

  cerebras: {
    key: 'cerebras',
    name: 'Cerebras',
    model: 'llama3.1-8b',
    models: [
      { id: 'llama3.1-8b',  name: 'Llama 3.1 8B (fastest)',  capabilities: ['chat'] },
      { id: 'gpt-oss-120b', name: 'GPT-OSS 120B (smarter)',  capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.cerebras.ai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#FF6B6B',
    bestFor: ['general'],
    goodAt: 'Fastest responses of any provider',
    notGreatAt: 'Deep reasoning or long-form writing',
    supportsVision: false,
    instructionsUrl: 'cloud.cerebras.ai',
  },

  groq: {
    key: 'groq',
    name: 'Groq',
    model: 'llama-3.1-8b-instant',
    models: [
      { id: 'llama-3.1-8b-instant',   name: 'Llama 3.1 8B (fast)',  capabilities: ['chat'] },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',       capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.groq.com/openai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#4ECDC4',
    bestFor: ['general', 'summarization'],
    goodAt: 'Fast, reliable general Q&A and summarisation',
    notGreatAt: 'Complex coding or nuanced creative writing',
    supportsVision: false,
    instructionsUrl: 'console.groq.com',
  },

  gemini: {
    key: 'gemini',
    name: 'Gemini',
    model: 'gemini-2.5-flash-lite',
    models: [
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (fast)',   capabilities: ['chat', 'vision'] },
      { id: 'gemini-2.5-flash',      name: 'Gemini 2.5 Flash (best quality)', capabilities: ['chat', 'vision'] },
    ],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    needsKey: true,
    paidOnly: false,
    color: '#45B7D1',
    bestFor: ['summarization', 'translation'],
    goodAt: 'Long documents, translation, and image understanding (vision)',
    notGreatAt: 'Can be slower than Groq/Cerebras for simple questions',
    supportsVision: true,
    instructionsUrl: 'aistudio.google.com',
  },

  mistral: {
    key: 'mistral',
    name: 'Mistral',
    model: 'mistral-small-latest',
    models: [
      { id: 'mistral-small-latest', name: 'Mistral Small',           capabilities: ['chat'] },
      { id: 'mistral-large-latest', name: 'Mistral Large (best quality)', capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.mistral.ai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#96CEB4',
    bestFor: ['coding', 'creative'],
    goodAt: 'Code generation, creative writing, detailed instructions',
    notGreatAt: 'Slightly slower than Groq for simple questions',
    supportsVision: false,
    instructionsUrl: 'console.mistral.ai',
  },

  sambanova: {
    key: 'sambanova',
    name: 'SambaNova',
    model: 'Meta-Llama-3.3-70B-Instruct',
    models: [
      { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.sambanova.ai/v1',
    needsKey: true,
    paidOnly: false,
    color: '#FFEAA7',
    bestFor: ['reasoning'],
    goodAt: 'Deep reasoning and nuanced answers',
    notGreatAt: 'Speed — larger model means slower responses',
    supportsVision: false,
    instructionsUrl: 'cloud.sambanova.ai',
  },

  openrouter: {
    key: 'openrouter',
    name: 'OpenRouter',
    model: 'openrouter/free',
    models: [
      { id: 'openrouter/free',                   name: 'Auto (best free model)',    capabilities: ['chat'] },
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (paid)',     capabilities: ['chat'] },
      { id: 'anthropic/claude-3.5-sonnet',       name: 'Claude 3.5 Sonnet (paid)', capabilities: ['chat', 'vision'] },
    ],
    baseUrl: 'https://openrouter.ai/api/v1',
    needsKey: true,
    paidOnly: false,
    color: '#A29BFE',
    bestFor: ['general', 'coding'],
    goodAt: 'Access to hundreds of models — free and paid — with one key',
    notGreatAt: 'Free models have rate limits; quality varies by model',
    supportsVision: false,
    instructionsUrl: 'openrouter.ai/keys',
    extraHeaders: {
      'HTTP-Referer': 'https://stevepleasants.com/manyai',
      'X-Title': 'ManyAI',
    },
  },

  cloudflare: {
    key: 'cloudflare',
    name: 'Cloudflare AI',
    model: '@cf/meta/llama-3.1-8b-instruct',
    models: [
      { id: '@cf/meta/llama-3.1-8b-instruct',           name: 'Llama 3.1 8B',        capabilities: ['chat'] },
      { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B (fast)', capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.cloudflare.com/client/v4/accounts',
    needsKey: true,
    paidOnly: false,
    color: '#F0A500',
    bestFor: ['general'],
    goodAt: 'Runs on Cloudflare edge — fast and free tier available',
    notGreatAt: 'Smaller model selection than other providers',
    supportsVision: false,
    instructionsUrl: 'dash.cloudflare.com',
    keyHint: 'Enter as accountID:apiToken',
  },

  huggingface: {
    key: 'huggingface',
    name: 'Hugging Face',
    model: 'Qwen/Qwen2.5-72B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct',        name: 'Qwen 2.5 72B',  capabilities: ['chat'] },
      { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B',  capabilities: ['chat'] },
      { id: 'HuggingFaceH4/zephyr-7b-beta',     name: 'Zephyr 7B',     capabilities: ['chat'] },
    ],
    baseUrl: 'https://router.huggingface.co/v1',
    needsKey: true,
    paidOnly: false,
    color: '#FFD93D',
    bestFor: ['general', 'coding'],
    goodAt: 'Massive model selection — thousands of open models available',
    notGreatAt: 'Free tier is rate limited; cold starts can be slow',
    supportsVision: false,
    instructionsUrl: 'huggingface.co/settings/tokens',
  },

  cohere: {
    key: 'cohere',
    name: 'Cohere',
    model: 'command-r-08-2024',
    models: [
      { id: 'command-r-08-2024',      name: 'Command R (2024)',   capabilities: ['chat'] },
      { id: 'command-r-plus-08-2024', name: 'Command R+ (2024)',  capabilities: ['chat'] },
      { id: 'command-a-03-2025',      name: 'Command A (newest)', capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.cohere.com/compatibility/v1',
    needsKey: true,
    paidOnly: false,
    color: '#55EFC4',
    bestFor: ['summarization', 'reasoning'],
    goodAt: 'Strong at summarization, retrieval, and business tasks',
    notGreatAt: 'Less well-known — smaller community than OpenAI/Meta models',
    supportsVision: false,
    instructionsUrl: 'dashboard.cohere.com',
  },

  // ── Paid (credit card required) ────────────────────────────────────────────

  fireworks: {
    key: 'fireworks',
    name: 'Fireworks',
    model: 'accounts/fireworks/models/deepseek-v3p1',
    models: [
      { id: 'accounts/fireworks/models/deepseek-v3p1',           name: 'DeepSeek V3',  capabilities: ['chat'] },
      { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', capabilities: ['chat'] },
    ],
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    needsKey: true,
    paidOnly: false,
    color: '#DDA0DD',
    bestFor: ['coding', 'general'],
    goodAt: 'Strong coding with DeepSeek V3',
    notGreatAt: 'Requires credit card; can return verbose responses',
    supportsVision: false,
    instructionsUrl: 'fireworks.ai',
  },

  openai: {
    key: 'openai',
    name: 'OpenAI',
    model: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (fast)',    capabilities: ['chat'] },
      { id: 'gpt-4o',      name: 'GPT-4o (best quality)', capabilities: ['chat', 'vision'] },
      { id: 'dall-e-3',    name: 'DALL·E 3',              capabilities: ['image'] },
      { id: 'dall-e-2',    name: 'DALL·E 2',              capabilities: ['image'] },
    ],
    baseUrl: 'https://api.openai.com/v1',
    needsKey: true,
    paidOnly: false,
    color: '#74B9FF',
    bestFor: ['coding', 'reasoning', 'general'],
    goodAt: 'Well-rounded — coding, vision, instruction following',
    notGreatAt: 'Costs money; rate limits on lower tiers',
    supportsVision: true,
    instructionsUrl: 'platform.openai.com',
  },

  anthropic: {
    key: 'anthropic',
    name: 'Claude (Anthropic)',
    model: 'claude-3-5-haiku-20241022',
    models: [
      { id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku (fast)',       capabilities: ['chat', 'vision'] },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (best)',       capabilities: ['chat', 'vision'] },
      { id: 'claude-3-opus-20240229',     name: 'Claude 3 Opus (most capable)',   capabilities: ['chat', 'vision'] },
    ],
    baseUrl: 'https://api.anthropic.com/v1',
    needsKey: true,
    paidOnly: true,
    color: '#FD79A8',
    bestFor: ['coding', 'reasoning', 'creative'],
    goodAt: 'Exceptional reasoning, coding, and long-form writing',
    notGreatAt: 'Costs money; no free tier',
    supportsVision: true,
    instructionsUrl: 'console.anthropic.com',
  },

  // ── No key required ────────────────────────────────────────────────────────

  pollinations: {
    key: 'pollinations',
    name: 'Pollinations',
    model: 'openai',
    models: [
      { id: 'openai',       name: 'OpenAI (via Pollinations)',  capabilities: ['chat'] },
      { id: 'mistral',      name: 'Mistral (via Pollinations)', capabilities: ['chat'] },
      { id: 'llama',        name: 'Llama (via Pollinations)',   capabilities: ['chat'] },
      { id: 'flux',         name: 'Flux',                       capabilities: ['image'], randomSeed: true },
      { id: 'flux-realism', name: 'Flux Realism',               capabilities: ['image'], randomSeed: true },
      { id: 'flux-anime',   name: 'Flux Anime',                 capabilities: ['image'], randomSeed: true },
      { id: 'flux-3d',      name: 'Flux 3D',                    capabilities: ['image'], randomSeed: true },
      { id: 'turbo',        name: 'Turbo',                      capabilities: ['image'], randomSeed: true },
      { id: 'gptimage',     name: 'GPT Image',                  capabilities: ['image'], randomSeed: true },
    ],
    baseUrl: 'https://text.pollinations.ai',
    needsKey: false,
    paidOnly: false,
    color: '#FD79A8',
    bestFor: ['general', 'creative'],
    goodAt: 'No API key needed — always available as a fallback',
    notGreatAt: 'Less reliable, variable quality',
    supportsVision: false,
    instructionsUrl: 'pollinations.ai',
  },
};

export const ROUTING_ORDER: string[] = [
  'cerebras',
  'groq',
  'gemini',
  'mistral',
  'sambanova',
  'openrouter',
  'huggingface',
  'cohere',
  'cloudflare',
  'fireworks',
  'openai',
  'anthropic',
  'pollinations',
];

// ── Dynamic provider storage ──────────────────────────────────────────────────

const CUSTOM_PROVIDERS_KEY  = 'manyai_custom_providers';
const REMOVED_PROVIDERS_KEY = 'manyai_removed_providers';

export function loadCustomProviders(): Provider[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PROVIDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCustomProviders(providers: Provider[]): void {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(providers));
}

export function loadRemovedProviders(): string[] {
  try {
    const raw = localStorage.getItem(REMOVED_PROVIDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveRemovedProviders(removed: string[]): void {
  localStorage.setItem(REMOVED_PROVIDERS_KEY, JSON.stringify(removed));
}

/** Returns all active providers: built-ins (not removed) + custom (overrides by key). */
export function getAllProviders(): Record<string, Provider> {
  const removed = new Set(loadRemovedProviders());
  const custom  = loadCustomProviders();
  const customMap = Object.fromEntries(custom.map(p => [p.key, p]));
  const filtered  = Object.fromEntries(
    Object.entries(PROVIDERS).filter(([k]) => !removed.has(k))
  );
  return { ...filtered, ...customMap };
}

/** Ordered list of active provider keys. */
export function getAllProviderOrder(): string[] {
  const removed = new Set(loadRemovedProviders());
  const custom  = loadCustomProviders();
  const builtinOrder = ROUTING_ORDER.filter(k => !removed.has(k));
  const customKeys   = custom.map(p => p.key).filter(k => !(k in PROVIDERS));
  return [...builtinOrder, ...customKeys];
}

/** Add or update a provider (used for both new and edited providers). */
export function upsertProvider(provider: Provider): void {
  const customs = loadCustomProviders().filter(p => p.key !== provider.key);
  saveCustomProviders([...customs, provider]);
  // If this key was previously removed, un-remove it
  const removed = loadRemovedProviders().filter(k => k !== provider.key);
  saveRemovedProviders(removed);
}

/** Remove a provider. Built-ins are hidden; custom ones are deleted. */
export function removeProvider(key: string): void {
  if (key in PROVIDERS) {
    const removed = loadRemovedProviders();
    if (!removed.includes(key)) saveRemovedProviders([...removed, key]);
  }
  const customs = loadCustomProviders().filter(p => p.key !== key);
  saveCustomProviders(customs);
}
