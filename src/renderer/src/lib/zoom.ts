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

/**
 * Persist and immediately apply a zoom percentage.
 *
 * We scale #root with transform:scale() instead of body.style.zoom so that
 * 100vh / 100% units stay anchored to the real viewport size. body.style.zoom
 * inflates vh units, which pushes fixed-height containers (like the right panel)
 * off-screen. transform:scale keeps the coordinate space intact — we just
 * shrink the #root bounding box to compensate so nothing overflows.
 */
export function applyZoom(pct: number): void {
  const clamped = Math.max(MIN, Math.min(MAX, pct))
  localStorage.setItem(LS_KEY, String(clamped))

  const root = document.getElementById('root')
  if (!root) return

  const f = clamped / 100
  root.style.transform       = `scale(${f})`
  root.style.transformOrigin = 'top left'
  // Counter-scale the dimensions so the element fills the viewport after scaling
  root.style.width  = `${100 / f}%`
  root.style.height = `${100 / f}vh`
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
