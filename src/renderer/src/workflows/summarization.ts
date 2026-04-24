import type { WorkflowPlugin } from './types'

export const summarizationWorkflow: WorkflowPlugin = {
  type: 'summarization',
  label: 'Summarize',
  icon: '📋',
  description: 'Summarizing documents, extracting key points',
  keywords: /\b(summarize|summary|tldr|tl;dr|brief|condense|shorten|overview|key points|main points|digest)\b/i,
  defaultRoutes: [
    { provider: 'gemini', model: 'gemini-2.5-flash' },
    { provider: 'cohere', model: 'command-r-plus-08-2024' },
    { provider: 'groq',   model: 'llama-3.3-70b-versatile' },
  ],
}
