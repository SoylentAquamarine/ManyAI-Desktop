import type { WorkflowPlugin } from './types'

export const creativeWorkflow: WorkflowPlugin = {
  type: 'creative',
  label: 'Creative',
  icon: '✍️',
  description: 'Stories, poems, brainstorming, creative writing',
  keywords: /\b(write a story|poem|creative|imagine|fiction|novel|narrative|character|plot|lyrics|haiku|essay|brainstorm|invent|fantasy|roleplay)\b/i,
  defaultRoutes: [
    { provider: 'mistral',   model: 'mistral-small-latest' },
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    { provider: 'openai',    model: 'gpt-4o' },
  ],
}
