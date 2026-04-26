import type { WorkflowPlugin } from './types'

export const translationWorkflow: WorkflowPlugin = {
  type: 'translation',
  label: 'Translate',
  icon: '🌐',
  description: 'Language translation',
  defaultRoutes: [
    { provider: 'gemini',  model: 'gemini-2.5-flash' },
    { provider: 'mistral', model: 'mistral-large-latest' },
  ],
  workflowType: ['chat'],
}
