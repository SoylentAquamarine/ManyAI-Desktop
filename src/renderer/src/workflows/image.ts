import type { WorkflowPlugin } from './types'

export const imageWorkflow: WorkflowPlugin = {
  type: 'image',
  label: 'Image',
  icon: '🎨',
  description: 'Generate images from text descriptions',
  defaultRoutes: [{ provider: 'pollinations', model: 'flux' }],
  workflowType: ['image'],
}
