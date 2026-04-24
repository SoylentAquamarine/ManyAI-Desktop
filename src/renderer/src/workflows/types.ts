export interface RouteEntry {
  provider: string
  model: string
  enabled?: boolean
}

export interface WorkflowPlugin {
  type: string
  label: string
  icon: string
  description: string
  keywords: RegExp
  defaultRoutes: RouteEntry[]
  /** Signals that this workflow produces images, not text */
  isImage?: boolean
}
