/**
 * font.ts — Font face definitions and persistence.
 *
 * All fonts are system fonts (no external downloads required).
 * applyFont() overrides the --font CSS custom property on :root,
 * which body, inputs, buttons, and textareas all inherit from.
 */

export interface FontDef {
  id: string
  label: string
  stack: string
}

export const FONTS: FontDef[] = [
  { id: 'system',      label: 'System Default',  stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: 'arial',       label: 'Arial',           stack: "Arial, Helvetica, sans-serif" },
  { id: 'calibri',     label: 'Calibri',         stack: "Calibri, 'Gill Sans', sans-serif" },
  { id: 'comic-sans',  label: 'Comic Sans',      stack: "'Comic Sans MS', 'Comic Sans', cursive" },
  { id: 'consolas',    label: 'Consolas',        stack: "Consolas, 'Courier New', monospace" },
  { id: 'courier',     label: 'Courier New',     stack: "'Courier New', Courier, monospace" },
  { id: 'georgia',     label: 'Georgia',         stack: "Georgia, 'Times New Roman', serif" },
  { id: 'impact',      label: 'Impact',          stack: "Impact, Haettenschweiler, sans-serif" },
  { id: 'segoe',       label: 'Segoe UI',        stack: "'Segoe UI', Arial, sans-serif" },
  { id: 'tahoma',      label: 'Tahoma',          stack: "Tahoma, Geneva, sans-serif" },
  { id: 'times',       label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'trebuchet',   label: 'Trebuchet MS',    stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: 'verdana',     label: 'Verdana',         stack: "Verdana, Geneva, sans-serif" },
]

const KEY = 'manyai_font'

export function loadFont(): string {
  return localStorage.getItem(KEY) ?? 'system'
}

export function saveFont(id: string): void {
  localStorage.setItem(KEY, id)
  applyFont(id)
}

export function applyFont(id: string): void {
  const font = FONTS.find(f => f.id === id) ?? FONTS[0]
  document.documentElement.style.setProperty('--font', font.stack)
}
