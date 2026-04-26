import type { WorkflowPlugin } from './types'

export const codingWorkflow: WorkflowPlugin = {
  type: 'coding',
  label: 'Code',
  icon: '💻',
  description: 'Code generation, debugging, explaining code',
  defaultRoutes: [
    { provider: 'mistral',   model: 'mistral-large-latest' },
    { provider: 'openai',    model: 'gpt-4o' },
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  ],
  workflowType: ['chat'],
}
