import type { WorkflowPlugin } from './types'

export const reasoningWorkflow: WorkflowPlugin = {
  type: 'reasoning',
  label: 'Reasoning',
  icon: '🧠',
  description: 'Math, logic, analysis, step-by-step thinking',
  keywords: /\b(calculate|solve|math|equation|logic|proof|analyze|analysis|deduce|infer|probability|statistic|step.by.step|reason|explain why|how does|what is the difference)\b/i,
  defaultRoutes: [
    { provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct' },
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    { provider: 'openai',    model: 'gpt-4o' },
  ],
  workflowType: ['chat'],
}
