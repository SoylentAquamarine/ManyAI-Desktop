/**
 * callProvider.ts — Sends a prompt to an AI provider's API.
 *
 * API shapes supported:
 *   - Pollinations  : simple GET, no key
 *   - Gemini        : Google generateContent REST format
 *   - Anthropic     : Anthropic Messages API (x-api-key auth, different body shape)
 *   - Cloudflare    : Workers AI (account ID embedded in URL, key = "accountId:apiToken")
 *   - OpenAI-compat : all other providers — /chat/completions with Bearer auth
 */

import { Provider } from './providers';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_HISTORY = 10;

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  error?: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

type OpenAIContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// Fake Response shape returned when proxying through main process
interface FetchLike {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}

async function doFetch(provider: Provider, url: string, opts: RequestInit = {}): Promise<FetchLike> {
  if (provider.proxyMode === 'proxied') {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), FETCH_TIMEOUT_MS)
    )
    const requestPromise = window.api.proxyRequest({
      url,
      method: (opts.method as string) ?? 'GET',
      headers: (opts.headers as Record<string, string>) ?? {},
      body: opts.body as string | undefined,
    })
    const result = await Promise.race([requestPromise, timeoutPromise])
    if ('error' in result) throw new Error(result.error)
    const { status, body } = result as { status: number; body: string }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => { try { return Promise.resolve(JSON.parse(body)) } catch { return Promise.reject(new Error('Invalid JSON')) } },
      text: () => Promise.resolve(body),
    }
  }
  return fetchWithTimeout(url, opts)
}


export async function callProvider(
  provider: Provider,
  prompt: string,
  apiKey?: string,
  imageBase64?: string,
  imageMime?: string,
  history: HistoryMessage[] = [],
): Promise<AIResponse> {
  const start = Date.now();
  const elapsed = () => Date.now() - start;

  try {

    const apiFormat = provider.apiFormat ?? 'openai-compat'

    // ── Pollinations — keyless GET ────────────────────────────────────────────
    if (apiFormat === 'pollinations') {
      const recentHistory = history.slice(-MAX_HISTORY);
      const contextPrefix = recentHistory.length > 0
        ? recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') + '\nUser: '
        : '';
      const url = `${provider.baseUrl}/${encodeURIComponent(contextPrefix + prompt)}`;
      const res = await doFetch(provider, url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const content = await res.text();
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ── Gemini — Google generateContent format ────────────────────────────────
    if (apiFormat === 'gemini') {
      const url = `${provider.baseUrl}/models/${provider.model}:generateContent?key=${apiKey}`;
      const recentHistory = history.slice(-MAX_HISTORY);
      const contents: { role: string; parts: GeminiPart[] }[] = recentHistory.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const currentParts: GeminiPart[] = [];
      if (imageBase64 && imageMime) {
        currentParts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
      }
      currentParts.push({ text: prompt });
      contents.push({ role: 'user', parts: currentParts });

      const res = await doFetch(provider, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const e = await res.json(); errMsg = (e as any)?.error?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json() as any;
      const content: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ── Anthropic Claude — Messages API ───────────────────────────────────────
    if (apiFormat === 'anthropic') {
      const recentHistory = history.slice(-MAX_HISTORY);
      const messages: { role: string; content: any }[] = recentHistory.map(m => ({
        role: m.role,
        content: m.content,
      }));

      // Current message — with optional vision
      if (imageBase64 && imageMime) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imageMime, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const res = await doFetch(provider, `${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: provider.models.find(m => m.id === provider.model)?.maxTokens ?? 1024,
          messages,
        }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const e = await res.json(); errMsg = (e as any)?.error?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json() as any;
      const content: string = json?.content?.[0]?.text ?? '';
      return { content, provider: provider.key, model: json?.model ?? provider.model, latencyMs: elapsed() };
    }

    // ── Cloudflare Workers AI — account ID embedded in URL ────────────────────
    if (apiFormat === 'cloudflare') {
      // Key format: "accountId:apiToken"
      const [accountId, apiToken] = (apiKey ?? ':').split(':');
      const url = `${provider.baseUrl}/${accountId}/ai/v1/chat/completions`;
      const recentHistory = history.slice(-MAX_HISTORY);
      const messages = [
        ...recentHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt },
      ];

      const res = await doFetch(provider, url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ model: provider.model, messages }),
      });
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try { const e = await res.json(); errMsg = (e as any)?.errors?.[0]?.message ?? errMsg; } catch {}
        throw new Error(errMsg);
      }
      const json = await res.json() as any;
      const content: string = json?.choices?.[0]?.message?.content ?? '';
      return { content, provider: provider.key, model: provider.model, latencyMs: elapsed() };
    }

    // ── OpenAI-compatible — all other providers ───────────────────────────────
    const recentHistory = history.slice(-MAX_HISTORY);
    const messages: { role: string; content: string | OpenAIContentItem[] }[] = recentHistory.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let messageContent: string | OpenAIContentItem[];
    if (imageBase64 && imageMime) {
      messageContent = [
        { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
        { type: 'text', text: prompt },
      ];
    } else {
      messageContent = prompt;
    }
    messages.push({ role: 'user', content: messageContent });

    const res = await doFetch(provider, `${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        ...(provider.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: provider.models.find(m => m.id === provider.model)?.maxTokens ?? 1024,
        messages,
      }),
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try { const e = await res.json(); errMsg = (e as any)?.error?.message ?? errMsg; } catch {}
      throw new Error(errMsg);
    }

    const json = await res.json() as any;
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const model: string = json?.model ?? provider.model;
    return { content, provider: provider.key, model, latencyMs: elapsed() };

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: '', provider: provider.key, model: provider.model, latencyMs: elapsed(), error: message };
  }
}
