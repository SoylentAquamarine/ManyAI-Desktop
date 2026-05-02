import type { WorkflowPlugin } from './types'

export const filesystemWorkflow: WorkflowPlugin = {
  type: 'filesystem',
  label: 'Local Code',
  icon: '🗂️',
  description: 'Read, edit, and manage local files and folders with AI assistance',
  defaultRoutes: [
    { provider: 'mistral',   model: 'mistral-large-latest' },
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    { provider: 'openai',    model: 'gpt-4o' },
    { provider: 'ollama',    model: 'qwen2.5-coder:7b' },
  ],
  workflowType: ['chat'],
}
