/**
 * zoom.ts — UI zoom / font-size scaling.
 *
 * Sets document.body.style.zoom so every px-based style scales uniformly.
 * Range: 80 – 140 % in 5 % steps. Default: 100 %.
 * Persisted in localStorage so the choice survives restarts.
 */

const LS_KEY  = 'manyai_zoom'
const DEFAULT = 100
const MIN     = 80
const MAX     = 140
const STEP    = 5

/** Return the stored zoom percentage (80–140). */
export function loadZoom(): number {
  const raw = parseInt(localStorage.getItem(LS_KEY) ?? String(DEFAULT), 10)
  return isNaN(raw) ? DEFAULT : Math.max(MIN, Math.min(MAX, raw))
}

/** Persist and immediately apply a zoom percentage. */
export function applyZoom(pct: number): void {
  const clamped = Math.max(MIN, Math.min(MAX, pct))
  localStorage.setItem(LS_KEY, String(clamped))
  document.body.style.zoom = `${clamped}%`
}

export function increaseZoom(): number {
  const next = Math.min(MAX, loadZoom() + STEP)
  applyZoom(next)
  return next
}

export function decreaseZoom(): number {
  const next = Math.max(MIN, loadZoom() - STEP)
  applyZoom(next)
  return next
}

export { MIN as ZOOM_MIN, MAX as ZOOM_MAX, DEFAULT as ZOOM_DEFAULT }
