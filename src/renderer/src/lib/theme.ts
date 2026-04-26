export type ThemeId = 'midnight' | 'dark' | 'light' | 'hotdog'

export const THEMES: { id: ThemeId; label: string; preview: string }[] = [
  { id: 'midnight', label: 'Midnight',    preview: '#1a1a2e' },
  { id: 'dark',     label: 'Dark',        preview: '#1e1e1e' },
  { id: 'light',    label: 'Light',       preview: '#ffffff' },
  { id: 'hotdog',   label: 'Hotdog Stand', preview: '#ff0000' },
]

const KEY = 'manyai_theme'

export function loadTheme(): ThemeId {
  return (localStorage.getItem(KEY) as ThemeId) ?? 'midnight'
}

export function applyTheme(id: ThemeId) {
  if (id === 'midnight') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', id)
  }
}

export function saveTheme(id: ThemeId) {
  localStorage.setItem(KEY, id)
  applyTheme(id)
}
