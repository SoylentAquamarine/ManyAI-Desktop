/**
 * savedResponses.ts — Save and retrieve AI responses using localStorage.
 */

export interface SavedResponse {
  id: string;
  title: string;
  prompt: string;
  response: string;
  provider: string;
  category: string;
  savedAt: string;
  imageUri?: string;
}

const RESPONSES_KEY = 'manyai_saved_responses';
const CATEGORIES_KEY = 'manyai_categories';

export const DEFAULT_CATEGORIES = ['General', 'Recipes', 'Code', 'Research', 'Ideas', 'Writing'];

export function defaultTitle(response: string, prompt?: string): string {
  const source = response.trim() || prompt?.trim() || '';
  const firstLine = source.split('\n')[0].trim();
  return firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine || 'Untitled';
}

export function loadCategories(): string[] {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  if (!raw) return [...DEFAULT_CATEGORIES];
  try { return JSON.parse(raw); } catch { return [...DEFAULT_CATEGORIES]; }
}

export function saveCategories(cats: string[]): void {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(cats));
}

export function loadAllResponses(): SavedResponse[] {
  const raw = localStorage.getItem(RESPONSES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function saveResponse(
  prompt: string,
  response: string,
  provider: string,
  category: string = 'General',
  title?: string,
): SavedResponse {
  const all = loadAllResponses();
  const item: SavedResponse = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title ?? defaultTitle(response, prompt),
    prompt,
    response,
    provider,
    category,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(RESPONSES_KEY, JSON.stringify([item, ...all]));
  return item;
}

export function deleteResponse(id: string): void {
  const all = loadAllResponses();
  localStorage.setItem(RESPONSES_KEY, JSON.stringify(all.filter(r => r.id !== id)));
}
