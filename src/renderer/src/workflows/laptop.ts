import type { WorkflowPlugin } from './types'

export const laptopWorkflow: WorkflowPlugin = {
  type: 'laptop',
  label: 'Laptop',
  icon: '🖥️',
  description: 'Local inference via Ollama — private, offline, zero cost',
  defaultRoutes: [
    { provider: 'laptop', model: 'qwen2.5:7b' },
  ],
  workflowType: ['chat'],
}
