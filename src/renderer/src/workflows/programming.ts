import type { WorkflowPlugin } from './types'

export const programmingWorkflow: WorkflowPlugin = {
  type: 'programming',
  label: 'Programming',
  icon: '⚙️',
  description: 'Autonomous coding agent — reads and writes files directly, no token limits',
  defaultRoutes: [
    { provider: 'laptop', model: 'qwen2.5:7b' },
  ],
  workflowType: ['chat'],
}
