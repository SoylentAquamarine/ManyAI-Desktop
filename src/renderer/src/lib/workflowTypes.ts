export const WORKFLOW_TYPES = ['chat', 'image', 'vision', 'audio', 'video', 'agent'] as const
export type WorkflowType = typeof WORKFLOW_TYPES[number]

export const WORKFLOW_TYPE_LABELS: Record<WorkflowType, string> = {
  chat:   'Chat / General Reasoning',
  image:  'Image Generation',
  vision: 'Vision / Image Analysis',
  audio:  'Audio (S2T/T2S)',
  video:  'Video Generation',
  agent:  'Local Agent',
}
