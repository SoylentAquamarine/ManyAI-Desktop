/**
 * workflows.ts — User-configurable workflow type list.
 *
 * Built-in workflow types map 1:1 to TaskType for routing.
 * Users can enable/disable them; disabled types won't appear in the tab picker.
 * 'general' is always enabled and cannot be disabled.
 */

import { TASK_META, TASK_TYPES } from './routing';
import type { TaskType } from './providers';

export interface WorkflowDef {
  type: TaskType;
  label: string;
  icon: string;
  description: string;
  enabled: boolean;
  builtIn: boolean;   // built-ins can be disabled but not deleted
}

const WORKFLOWS_KEY = 'manyai_workflows_config';

/** The canonical built-in list derived from TASK_META */
export const BUILTIN_WORKFLOWS: WorkflowDef[] = TASK_TYPES.map(t => ({
  type: t,
  label: TASK_META[t].label,
  icon: TASK_META[t].icon,
  description: TASK_META[t].description,
  enabled: true,
  builtIn: true,
}));

export function loadWorkflows(): WorkflowDef[] {
  try {
    const raw = localStorage.getItem(WORKFLOWS_KEY);
    if (!raw) return BUILTIN_WORKFLOWS.map(w => ({ ...w }));
    const stored: Partial<WorkflowDef>[] = JSON.parse(raw);
    // Merge stored enabled flags back onto the canonical built-in list
    // (preserves label/icon/description from source-of-truth, only respects stored.enabled)
    return BUILTIN_WORKFLOWS.map(builtin => {
      const saved = stored.find(s => s.type === builtin.type);
      return {
        ...builtin,
        // general is always enabled
        enabled: builtin.type === 'general' ? true : (saved?.enabled ?? true),
      };
    });
  } catch {
    return BUILTIN_WORKFLOWS.map(w => ({ ...w }));
  }
}

export function saveWorkflows(workflows: WorkflowDef[]): void {
  // Only persist the parts users can change — type + enabled
  const slim = workflows.map(w => ({ type: w.type, enabled: w.enabled }));
  localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(slim));
}

/** Returns only the enabled workflow types (always includes general) */
export function enabledWorkflows(): WorkflowDef[] {
  return loadWorkflows().filter(w => w.enabled);
}
