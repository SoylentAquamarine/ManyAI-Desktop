/**
 * rss.ts — RSS reader workflow definition.
 *
 * Special workflow type: renders RssScreen instead of ChatScreen.
 * Acts as a data source in the workflow engine — items can be published
 * to workflowBus and injected into any other workflow tab.
 */

import type { WorkflowPlugin } from './types'

export const rssWorkflow: WorkflowPlugin = {
  type: 'rss',
  label: 'RSS',
  icon: '📰',
  description: 'RSS/Atom feed reader — send articles to any workflow',
  defaultRoutes: [],
  workflowType: ['chat'],
}
