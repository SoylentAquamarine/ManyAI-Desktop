/**
 * workflows.ts — Workflow definitions and persistence.
 * Built-in workflows come from src/workflows/. Custom ones live in
 * {workingDir}/workflows/ as individual JSON files (one per workflow).
 * Removed builtins and per-builtin enabled overrides live in manyai-config.json.
 */

import { WORKFLOW_REGISTRY } from '../workflows'
import { getWorkingDir } from './workingDir'

export interface ContextFile {
  path: string
  name: string
}

export interface WorkflowDef {
  type: string
  label: string
  icon: string
  description: string
  enabled: boolean
  builtIn: boolean
  workflowType?: import('./workflowTypes').WorkflowType[]
  systemPrompt?: string
  contextFiles?: ContextFile[]
  routes?: import('../workflows/types').RouteEntry[]
}

const LEGACY_CUSTOM_KEY = 'manyai_custom_workflows'

export const BUILTIN_WORKFLOWS: WorkflowDef[] = WORKFLOW_REGISTRY.map(w => ({
  type: w.type,
  label: w.label,
  icon: w.icon,
  description: w.description,
  enabled: true,
  builtIn: true,
  workflowType: w.workflowType,
}))

// ── In-memory cache ───────────────────────────────────────────────────────────

let _customs: WorkflowDef[] = []
let _removedBuiltins: string[] = []
let _builtinEnabled: Record<string, boolean> = {}
let _ready = false

export async function initWorkflows(): Promise<void> {
  if (_ready) return
  const workingDir = getWorkingDir()
  if (!workingDir) { _ready = true; return }

  // Load removed builtins and builtin enabled overrides from durable config
  const cfg = await window.api.getConfig()
  _removedBuiltins = (cfg.config.removedBuiltins as string[] | undefined) ?? _loadLegacyRemovedBuiltins()
  _builtinEnabled = (cfg.config.builtinEnabled as Record<string, boolean> | undefined) ?? {}

  // Migrate legacy removedBuiltins from localStorage to config on first run
  if (_removedBuiltins.length > 0 && !cfg.config.removedBuiltins) {
    window.api.setConfig({ removedBuiltins: _removedBuiltins, builtinEnabled: _builtinEnabled }).catch(console.error)
    localStorage.removeItem('manyai_removed_builtins')
  }

  const result = await window.api.readWorkflows(workingDir)

  if ('workflows' in result && result.workflows.length > 0) {
    _customs = result.workflows as WorkflowDef[]
    localStorage.removeItem(LEGACY_CUSTOM_KEY)
    _ready = true
    return
  }

  // Empty folder or first run — migrate from localStorage if anything is there
  const legacy = _loadLegacy()
  if (legacy.length > 0) {
    _customs = legacy
    for (const w of legacy) {
      window.api.writeWorkflow(workingDir, w.type, w).catch(console.error)
    }
    localStorage.removeItem(LEGACY_CUSTOM_KEY)
  }

  _ready = true
}

/** Reset ready flag so initWorkflows re-runs (call after working dir changes). */
export function resetWorkflows(): void {
  _ready = false
  _customs = []
  _removedBuiltins = []
  _builtinEnabled = {}
}

function _loadLegacy(): WorkflowDef[] {
  try {
    const raw = localStorage.getItem(LEGACY_CUSTOM_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function _loadLegacyRemovedBuiltins(): string[] {
  try {
    const raw = localStorage.getItem('manyai_removed_builtins')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// ── Removed builtins and builtin enabled (stored in manyai-config.json) ───────

export function loadRemovedBuiltins(): string[] {
  return _removedBuiltins
}

export function saveRemovedBuiltins(types: string[]): void {
  _removedBuiltins = types
  window.api.setConfig({ removedBuiltins: types }).catch(console.error)
}

export function setBuiltinEnabled(type: string, enabled: boolean): void {
  _builtinEnabled = { ..._builtinEnabled, [type]: enabled }
  window.api.setConfig({ builtinEnabled: _builtinEnabled }).catch(console.error)
}

// ── Custom workflow CRUD ──────────────────────────────────────────────────────

export function loadCustomWorkflows(): WorkflowDef[] {
  return _customs
}

export function saveCustomWorkflows(customs: WorkflowDef[]): void {
  const workingDir = getWorkingDir()
  const prev = new Set(_customs.map(w => w.type))
  const next = new Set(customs.map(w => w.type))

  for (const w of customs) {
    if (workingDir) window.api.writeWorkflow(workingDir, w.type, w).catch(console.error)
  }

  for (const type of prev) {
    if (!next.has(type) && workingDir) {
      window.api.deleteWorkflow(workingDir, type).catch(console.error)
    }
  }

  _customs = customs
}

/** Add or update a single custom workflow immediately. Updates memory and writes file. */
export function upsertCustomWorkflow(w: WorkflowDef): void {
  _customs = _customs.filter(c => c.type !== w.type).concat(w)
  const workingDir = getWorkingDir()
  if (workingDir) window.api.writeWorkflow(workingDir, w.type, w).catch(console.error)
}

/** Delete a single custom workflow immediately. Updates memory and deletes file. */
export function deleteCustomWorkflow(type: string): void {
  _customs = _customs.filter(c => c.type !== type)
  const workingDir = getWorkingDir()
  if (workingDir) window.api.deleteWorkflow(workingDir, type).catch(console.error)
}

// ── Combined load/save (used by WorkflowsScreen) ─────────────────────────────

export function loadWorkflows(): WorkflowDef[] {
  const removed = new Set(_removedBuiltins)
  const builtins = BUILTIN_WORKFLOWS
    .filter(w => !removed.has(w.type))
    .map(w => ({ ...w, enabled: _builtinEnabled[w.type] ?? true }))
  return [...builtins, ..._customs]
}

export function enabledWorkflows(): WorkflowDef[] {
  return loadWorkflows().filter(w => w.enabled)
}

export function getWorkflow(type: string): WorkflowDef | undefined {
  return loadWorkflows().find(w => w.type === type)
}
