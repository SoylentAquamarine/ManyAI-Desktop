/**
 * workflows.ts — Workflow definitions and persistence.
 * Built-in workflows come from src/workflows/. Custom ones live in
 * {workingDir}/workflows/ as individual JSON files (one per workflow).
 * On first run, any customs found in localStorage are migrated to files.
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
}

const ENABLED_KEY = 'manyai_workflows_config'
const REMOVED_KEY = 'manyai_removed_builtins'
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
let _ready = false

export async function initWorkflows(): Promise<void> {
  if (_ready) return
  const workingDir = getWorkingDir()
  if (!workingDir) { _ready = true; return }

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
}

function _loadLegacy(): WorkflowDef[] {
  try {
    const raw = localStorage.getItem(LEGACY_CUSTOM_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// ── Enabled / removed state (still localStorage — it's preference, not data) ─

function loadEnabledMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ENABLED_KEY)
    if (!raw) return {}
    const arr: { type: string; enabled: boolean }[] = JSON.parse(raw)
    return Object.fromEntries(arr.map(e => [e.type, e.enabled]))
  } catch { return {} }
}

function saveEnabledMap(workflows: WorkflowDef[]): void {
  const slim = workflows.map(w => ({ type: w.type, enabled: w.enabled }))
  localStorage.setItem(ENABLED_KEY, JSON.stringify(slim))
}

export function loadRemovedBuiltins(): string[] {
  try {
    const raw = localStorage.getItem(REMOVED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveRemovedBuiltins(types: string[]): void {
  localStorage.setItem(REMOVED_KEY, JSON.stringify(types))
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
  const enabledMap = loadEnabledMap()
  const removed = new Set(loadRemovedBuiltins())
  const builtins = BUILTIN_WORKFLOWS
    .filter(w => !removed.has(w.type))
    .map(w => ({ ...w, enabled: enabledMap[w.type] ?? true }))
  const customs = _customs.map(w => ({ ...w, enabled: enabledMap[w.type] ?? true }))
  return [...builtins, ...customs]
}

export function saveWorkflows(workflows: WorkflowDef[]): void {
  saveEnabledMap(workflows)
  saveCustomWorkflows(workflows.filter(w => !w.builtIn))
}

export function enabledWorkflows(): WorkflowDef[] {
  return loadWorkflows().filter(w => w.enabled)
}

export function getWorkflow(type: string): WorkflowDef | undefined {
  return loadWorkflows().find(w => w.type === type)
}
