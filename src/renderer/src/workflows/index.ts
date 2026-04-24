/**
 * Workflow registry — the single source of truth.
 *
 * To add a new workflow:
 *   1. Create src/renderer/src/workflows/myworkflow.ts
 *   2. Import it here and add it to WORKFLOW_REGISTRY
 *   No other files need to change.
 */

import { imageWorkflow }         from './image'
import { codingWorkflow }        from './coding'
import { reasoningWorkflow }     from './reasoning'
import { creativeWorkflow }      from './creative'
import { summarizationWorkflow } from './summarization'
import { translationWorkflow }   from './translation'
import { generalWorkflow }       from './general'

export type { WorkflowPlugin, RouteEntry } from './types'

export const WORKFLOW_REGISTRY = [
  imageWorkflow,
  codingWorkflow,
  reasoningWorkflow,
  creativeWorkflow,
  summarizationWorkflow,
  translationWorkflow,
  generalWorkflow,
]
