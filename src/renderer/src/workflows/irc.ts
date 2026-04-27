/**
 * irc.ts — IRC client workflow definition.
 *
 * This is a special built-in workflow that renders IrcScreen instead of ChatScreen.
 * It has no AI providers — the 'irc' type is intercepted in App.tsx before routing.
 */

import type { WorkflowPlugin } from './types'

export const ircWorkflow: WorkflowPlugin = {
  type: 'irc',
  label: 'IRC',
  icon: '📡',
  description: 'IRC client — connect to any IRC server',
  defaultRoutes: [],
  workflowType: ['chat'],
}
