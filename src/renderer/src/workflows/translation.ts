import type { WorkflowPlugin } from './types'

export const translationWorkflow: WorkflowPlugin = {
  type: 'translation',
  label: 'Translate',
  icon: '🌐',
  description: 'Language translation',
  keywords: /\b(translate|translation|in spanish|in french|in german|in japanese|in chinese|in arabic|in portuguese|in italian|in russian|in korean|en español|en français|auf deutsch)\b/i,
  defaultRoutes: [
    { provider: 'gemini',  model: 'gemini-2.5-flash' },
    { provider: 'mistral', model: 'mistral-large-latest' },
  ],
}
