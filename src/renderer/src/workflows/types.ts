import type { WorkflowType } from '../lib/workflowTypes'

export interface RouteEntry {
  provider: string
  model: string
  enabled?: boolean
}

export interface WorkflowPlugin {
  type: string
  label: string
  icon: string
  description: string
  defaultRoutes: RouteEntry[]
  workflowType: WorkflowType[]
}
