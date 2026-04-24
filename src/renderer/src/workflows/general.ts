import type { WorkflowPlugin } from './types'

export const generalWorkflow: WorkflowPlugin = {
  type: 'general',
  label: 'General',
  icon: '💬',
  description: 'Everything else — Q&A, chat, information',
  keywords: /./,
  defaultRoutes: [
    { provider: 'cerebras',    model: 'llama3.1-8b' },
    { provider: 'groq',        model: 'llama-3.1-8b-instant' },
    { provider: 'pollinations', model: 'openai' },
  ],
}
