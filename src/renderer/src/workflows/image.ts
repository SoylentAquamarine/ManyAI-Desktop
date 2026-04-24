import type { WorkflowPlugin } from './types'

export const imageWorkflow: WorkflowPlugin = {
  type: 'image',
  label: 'Image',
  icon: '🎨',
  description: 'Generate images from text descriptions',
  keywords: /\b(generate|create|draw|paint|render|image|picture|photo|illustration|artwork|portrait|landscape|design|logo|icon|visualize|imagine)\b.*\b(of|a|an|the|me|showing)\b|\b(image|picture|photo|illustration|artwork|painting|drawing) of\b/i,
  defaultRoutes: [{ provider: 'pollinations', model: 'flux' }],
  isImage: true,
}
