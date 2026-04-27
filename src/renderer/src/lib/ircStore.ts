/**
 * ircStore.ts — Shared singleton for IRC panel state.
 *
 * IrcScreen writes here whenever its relevant state changes.
 * RightPanel reads from here when the active tab is an IRC workflow.
 * This keeps the two components fully decoupled — no prop drilling through App.
 */

export interface IrcPanelState {
  connected:     boolean
  currentNick:   string
  activeChannel: string | null
  /** Sorted user list for the active channel — ops (@) first, then alphabetical */
  users:         string[]
}

const DEFAULT_STATE: IrcPanelState = {
  connected:     false,
  currentNick:   '',
  activeChannel: null,
  users:         [],
}

type Listener = (state: IrcPanelState) => void
const listeners = new Set<Listener>()
let current: IrcPanelState = { ...DEFAULT_STATE }

export const ircStore = {
  /** IrcScreen calls this whenever connected/nick/channel/names changes. */
  setState(next: IrcPanelState): void {
    current = next
    listeners.forEach(fn => fn(current))
  },

  /** Current snapshot — useful for useState initializer. */
  getState(): IrcPanelState { return current },

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
