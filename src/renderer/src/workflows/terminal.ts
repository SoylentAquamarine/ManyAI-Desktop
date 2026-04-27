import type { WorkflowPlugin } from './types'

export const terminalWorkflow: WorkflowPlugin = {
  type:         'terminal',
  label:        'Terminal',
  icon:         '🖥',
  description:  'SSH / Telnet client — pipe output into any workflow',
  defaultRoutes: [],
  workflowType: ['chat'],
}
