/**
 * workflows.ts — Workflow definitions and persistence.
 *
 * System workflows (irc, rss, terminal) are code-defined and never written to files.
 * All other workflows — built-in defaults AND user-created ones — live as JSON files
 * in {workingDir}/workflows/. Built-in defaults are seeded to the folder on first run
 * so the user can edit, delete, or reorder them like any other workflow.
 *
 * Boot sequence:
 *   1. Read existing files from {workingDir}/workflows/
 *   2. Seed any missing non-system built-ins as JSON files
 *   3. Re-merge: _fileWorkflows = all files; _systemWorkflows = irc/rss/terminal
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

// ── System workflows — always code-defined, never file-backed ─────────────────

const SYSTEM_TYPES = new Set(['irc', 'rss', 'terminal', 'programming'])

const SYSTEM_WORKFLOWS: WorkflowDef[] = WORKFLOW_REGISTRY
  .filter(w => SYSTEM_TYPES.has(w.type))
  .map(w => ({
    type: w.type,
    label: w.label,
    icon: w.icon,
    description: w.description,
    enabled: true,
    builtIn: true,
    workflowType: w.workflowType,
  }))

// Kept for external callers that reference BUILTIN_WORKFLOWS
export const BUILTIN_WORKFLOWS = SYSTEM_WORKFLOWS

const LEGACY_CUSTOM_KEY = 'manyai_custom_workflows'

// ── In-memory state ───────────────────────────────────────────────────────────

let _fileWorkflows: WorkflowDef[] = []   // everything from the folder
let _builtinEnabled: Record<string, boolean> = {}
let _ready = false

// ── Init ──────────────────────────────────────────────────────────────────────

export async function initWorkflows(): Promise<void> {
  if (_ready) return
  const workingDir = getWorkingDir()
  if (!workingDir) { _ready = true; return }

  const cfg = await window.api.getConfig()
  _builtinEnabled = (cfg.config.builtinEnabled as Record<string, boolean> | undefined) ?? {}

  // Read whatever is already in the folder
  const result = await window.api.readWorkflows(workingDir)
  const existing: WorkflowDef[] = ('workflows' in result ? result.workflows : []) as WorkflowDef[]
  const existingTypes = new Set(existing.map(w => w.type))

  // Migrate legacy localStorage custom workflows on first run
  if (existing.length === 0) {
    const legacy = _loadLegacy()
    if (legacy.length > 0) {
      for (const w of legacy) {
        await window.api.writeWorkflow(workingDir, w.type, w).catch(console.error)
        existingTypes.add(w.type)
      }
      localStorage.removeItem(LEGACY_CUSTOM_KEY)
    }
  }

  // Seed missing non-system built-ins as JSON files
  for (const w of WORKFLOW_REGISTRY) {
    if (SYSTEM_TYPES.has(w.type)) continue
    if (existingTypes.has(w.type)) continue
    const def: WorkflowDef = {
      type: w.type,
      label: w.label,
      icon: w.icon,
      description: w.description,
      enabled: true,
      builtIn: false,
      workflowType: w.workflowType,
    }
    await window.api.writeWorkflow(workingDir, w.type, def).catch(console.error)
  }

  // Re-read the folder — now contains built-in seeds + user workflows
  const result2 = await window.api.readWorkflows(workingDir)
  _fileWorkflows = ('workflows' in result2 ? result2.workflows : []) as WorkflowDef[]

  _ready = true
}

export function resetWorkflows(): void {
  _ready = false
  _fileWorkflows = []
  _builtinEnabled = {}
}

// ── Removed/enabled overrides (kept in manyai-config.json) ───────────────────

export function loadRemovedBuiltins(): string[] {
  return []  // no longer needed — delete the file to remove a workflow
}

export function saveRemovedBuiltins(_types: string[]): void {
  // no-op — removal is now handled by deleteCustomWorkflow
}

export function setBuiltinEnabled(type: string, enabled: boolean): void {
  _builtinEnabled = { ..._builtinEnabled, [type]: enabled }
  window.api.setConfig({ builtinEnabled: _builtinEnabled }).catch(console.error)
  // Also update the file if it exists
  const w = _fileWorkflows.find(fw => fw.type === type)
  if (w) upsertCustomWorkflow({ ...w, enabled })
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function loadCustomWorkflows(): WorkflowDef[] {
  return _fileWorkflows
}

export function saveCustomWorkflows(customs: WorkflowDef[]): void {
  const workingDir = getWorkingDir()
  const prev = new Set(_fileWorkflows.map(w => w.type))
  const next = new Set(customs.map(w => w.type))

  for (const w of customs) {
    if (workingDir) window.api.writeWorkflow(workingDir, w.type, w).catch(console.error)
  }
  for (const type of prev) {
    if (!next.has(type) && workingDir) {
      window.api.deleteWorkflow(workingDir, type).catch(console.error)
    }
  }
  _fileWorkflows = customs
}

export function upsertCustomWorkflow(w: WorkflowDef): void {
  _fileWorkflows = _fileWorkflows.filter(c => c.type !== w.type).concat(w)
  const workingDir = getWorkingDir()
  if (workingDir) window.api.writeWorkflow(workingDir, w.type, w).catch(console.error)
}

export function deleteCustomWorkflow(type: string): void {
  _fileWorkflows = _fileWorkflows.filter(c => c.type !== type)
  const workingDir = getWorkingDir()
  if (workingDir) window.api.deleteWorkflow(workingDir, type).catch(console.error)
}

// ── Combined read (used everywhere) ──────────────────────────────────────────

export function loadWorkflows(): WorkflowDef[] {
  const fileTypes = new Set(_fileWorkflows.map(w => w.type))
  // System workflows always appear; file workflows appear as loaded
  const systems = SYSTEM_WORKFLOWS.map(w => ({
    ...w,
    enabled: _builtinEnabled[w.type] ?? true,
  }))
  // Deduplicate: if a system type somehow got a file, the file wins
  const fileBacked = _fileWorkflows.map(w => ({
    ...w,
    enabled: _builtinEnabled[w.type] ?? w.enabled,
  }))
  const systemsFiltered = systems.filter(w => !fileTypes.has(w.type))
  return [...systemsFiltered, ...fileBacked]
}

export function enabledWorkflows(): WorkflowDef[] {
  return loadWorkflows().filter(w => w.enabled)
}

export function getWorkflow(type: string): WorkflowDef | undefined {
  return loadWorkflows().find(w => w.type === type)
}

function _loadLegacy(): WorkflowDef[] {
  try {
    const raw = localStorage.getItem(LEGACY_CUSTOM_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
