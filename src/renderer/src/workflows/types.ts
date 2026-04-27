import type { WorkflowType } from '../lib/workflowTypes'

export interface RouteEntry {
  provider: string
  model: string
  enabled?: boolean
  instanceId?: string // stable GUID for this slot; survives check/uncheck, resets on delete+re-add
}

export interface WorkflowPlugin {
  type: string
  label: string
  icon: string
  description: string
  defaultRoutes: RouteEntry[]
  workflowType: WorkflowType[]
}
