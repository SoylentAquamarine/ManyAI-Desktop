import type { WorkflowPlugin } from './types'

export const codingWorkflow: WorkflowPlugin = {
  type: 'coding',
  label: 'Code',
  icon: '💻',
  description: 'Code generation, debugging, explaining code',
  keywords: /\b(code|function|bug|debug|error|program|script|class|method|variable|python|javascript|typescript|java|c\+\+|sql|html|css|api|npm|array|loop|syntax|compile|runtime|refactor|algorithm|regex|json|xml)\b/i,
  defaultRoutes: [
    { provider: 'mistral',   model: 'mistral-large-latest' },
    { provider: 'openai',    model: 'gpt-4o' },
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  ],
  workflowType: ['chat'],
}
