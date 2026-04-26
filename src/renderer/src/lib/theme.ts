/**
 * theme.ts — Theme definitions and persistence.
 *
 * The first four themes are ManyAI originals. The rest are reproductions of
 * the built-in color schemes from Windows 3.1 / Windows for Workgroups 3.11,
 * listed under the same names found in Control Panel → Color Schemes.
 *
 * Each theme maps to a [data-theme="<id>"] block in globals.css.
 * "midnight" is the default and has no data-theme attribute (it uses :root).
 *
 * preview: a CSS background value shown as a small swatch in Settings.
 * The diagonal gradient shows both bg and accent so schemes are distinguishable.
 */

export type ThemeId =
  // ── ManyAI originals ───────────────────────────────────────
  | 'midnight'
  | 'dark'
  | 'light'
  | 'hotdog'
  | 'black-and-white'
  | 'white-and-black'
  // ── Windows 3.1 / 3.11 schemes ────────────────────────────
  | 'win-default'
  | 'arizona'
  | 'black-leather-jacket'
  | 'bordeaux'
  | 'cinnamon'
  | 'designer'
  | 'emerald-city'
  | 'fluorescent'
  | 'lcd-default'
  | 'lcd-default-nr'
  | 'lcd-reversed-dark'
  | 'lcd-dark-nr'
  | 'lcd-reversed-light'
  | 'lcd-light-nr'
  | 'mahogany'
  | 'monochrome'
  | 'ocean'
  | 'pastel'
  | 'patchwork'
  | 'plasma-power-saver'
  | 'rugby'
  | 'the-blues'
  | 'tweed'
  | 'valentine'
  | 'wingtip'

export interface ThemeDef {
  id: ThemeId
  label: string
  /** CSS background value for the preview swatch (solid or gradient). */
  preview: string
  /** Optional group label shown above this theme in the picker. */
  group?: string
}

export const THEMES: ThemeDef[] = [
  // ── ManyAI originals ───────────────────────────────────────
  { id: 'midnight',            label: 'Midnight',                   preview: 'linear-gradient(135deg,#1a1a2e 50%,#4ecdc4 50%)',  group: 'ManyAI' },
  { id: 'dark',                label: 'Dark',                       preview: 'linear-gradient(135deg,#1e1e1e 50%,#4ecdc4 50%)' },
  { id: 'light',               label: 'Light',                      preview: 'linear-gradient(135deg,#f3f3f3 50%,#0078d4 50%)' },
  { id: 'hotdog',              label: 'Hotdog Stand',               preview: 'linear-gradient(135deg,#ff0000 50%,#ffff00 50%)' },
  { id: 'black-and-white',    label: 'Black and White',            preview: 'linear-gradient(135deg,#ffffff 50%,#000000 50%)' },
  { id: 'white-and-black',    label: 'White and Black',            preview: 'linear-gradient(135deg,#000000 50%,#ffffff 50%)' },

  // ── Windows 3.1 / 3.11 ────────────────────────────────────
  { id: 'win-default',         label: 'Windows Default',            preview: 'linear-gradient(135deg,#1c2040 50%,#4060c0 50%)',  group: 'Windows 3.1' },
  { id: 'arizona',             label: 'Arizona',                    preview: 'linear-gradient(135deg,#2c1a00 50%,#c86030 50%)' },
  { id: 'black-leather-jacket',label: 'Black Leather Jacket',       preview: 'linear-gradient(135deg,#0c0c0c 50%,#909090 50%)' },
  { id: 'bordeaux',            label: 'Bordeaux',                   preview: 'linear-gradient(135deg,#1e0008 50%,#900020 50%)' },
  { id: 'cinnamon',            label: 'Cinnamon',                   preview: 'linear-gradient(135deg,#200c00 50%,#b04010 50%)' },
  { id: 'designer',            label: 'Designer',                   preview: 'linear-gradient(135deg,#101020 50%,#8060a0 50%)' },
  { id: 'emerald-city',        label: 'Emerald City',               preview: 'linear-gradient(135deg,#001400 50%,#00b040 50%)' },
  { id: 'fluorescent',         label: 'Fluorescent',                preview: 'linear-gradient(135deg,#080810 50%,#00ff80 50%)' },
  { id: 'lcd-default',         label: 'LCD Default Screen Settings',preview: 'linear-gradient(135deg,#0a1a0a 50%,#70b040 50%)' },
  { id: 'lcd-default-nr',      label: 'LCD Default (Non-Reversed)', preview: 'linear-gradient(135deg,#d8e8c0 50%,#2a5000 50%)' },
  { id: 'lcd-reversed-dark',   label: 'LCD Reversed - Dark',        preview: 'linear-gradient(135deg,#001800 50%,#00ff00 50%)' },
  { id: 'lcd-dark-nr',         label: 'LCD Dark (Non-Reversed)',    preview: 'linear-gradient(135deg,#c0ffc0 50%,#003800 50%)' },
  { id: 'lcd-reversed-light',  label: 'LCD Reversed - Light',       preview: 'linear-gradient(135deg,#1c2c1c 50%,#60a040 50%)' },
  { id: 'lcd-light-nr',        label: 'LCD Light (Non-Reversed)',   preview: 'linear-gradient(135deg,#e8f0e0 50%,#304820 50%)' },
  { id: 'mahogany',            label: 'Mahogany',                   preview: 'linear-gradient(135deg,#1a0800 50%,#8c3000 50%)' },
  { id: 'monochrome',          label: 'Monochrome',                 preview: 'linear-gradient(135deg,#000000 50%,#aaaaaa 50%)' },
  { id: 'ocean',               label: 'Ocean',                      preview: 'linear-gradient(135deg,#000820 50%,#0050c0 50%)' },
  { id: 'pastel',              label: 'Pastel',                     preview: 'linear-gradient(135deg,#1c1c28 50%,#b090e0 50%)' },
  { id: 'patchwork',           label: 'Patchwork',                  preview: 'linear-gradient(135deg,#1c0c10 50%,#e05080 50%)' },
  { id: 'plasma-power-saver',  label: 'Plasma Power Saver',         preview: 'linear-gradient(135deg,#060010 50%,#9900ff 50%)' },
  { id: 'rugby',               label: 'Rugby',                      preview: 'linear-gradient(135deg,#0c1400 50%,#4a8800 50%)' },
  { id: 'the-blues',           label: 'The Blues',                  preview: 'linear-gradient(135deg,#000818 50%,#2060d0 50%)' },
  { id: 'tweed',               label: 'Tweed',                      preview: 'linear-gradient(135deg,#181410 50%,#706040 50%)' },
  { id: 'valentine',           label: 'Valentine',                  preview: 'linear-gradient(135deg,#200010 50%,#e01060 50%)' },
  { id: 'wingtip',             label: 'Wingtip',                    preview: 'linear-gradient(135deg,#141010 50%,#805040 50%)' },
]

const KEY = 'manyai_theme'

export function loadTheme(): ThemeId {
  return (localStorage.getItem(KEY) as ThemeId) ?? 'midnight'
}

export function applyTheme(id: ThemeId): void {
  if (id === 'midnight') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', id)
  }
}

export function saveTheme(id: ThemeId): void {
  localStorage.setItem(KEY, id)
  applyTheme(id)
}
