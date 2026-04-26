/**
 * workflows.ts — Workflow definitions and persistence.
 * Built-in workflows come from src/workflows/. Custom ones live in localStorage.
 */

import { WORKFLOW_REGISTRY } from '../workflows'

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
  /** Silently prepended before every user message */
  systemPrompt?: string
  /** Files read from disk and silently injected into every message */
  contextFiles?: ContextFile[]
}

const ENABLED_KEY  = 'manyai_workflows_config'
const CUSTOM_KEY   = 'manyai_custom_workflows'
const REMOVED_KEY  = 'manyai_removed_builtins'

export const BUILTIN_WORKFLOWS: WorkflowDef[] = WORKFLOW_REGISTRY.map(w => ({
  type: w.type,
  label: w.label,
  icon: w.icon,
  description: w.description,
  enabled: true,
  builtIn: true,
  workflowType: w.workflowType,
}))

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

export function loadCustomWorkflows(): WorkflowDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveCustomWorkflows(customs: WorkflowDef[]): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs))
}

export function loadWorkflows(): WorkflowDef[] {
  const enabledMap = loadEnabledMap()
  const removed = new Set(loadRemovedBuiltins())
  const builtins = BUILTIN_WORKFLOWS
    .filter(w => !removed.has(w.type))
    .map(w => ({
      ...w,
      enabled: enabledMap[w.type] ?? true,
    }))
  const customs = loadCustomWorkflows().map(w => ({
    ...w,
    enabled: enabledMap[w.type] ?? true,
  }))
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
