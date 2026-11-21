/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`. All four are
 * internal: no webhook carries them. `notifications` turns them into the
 * staff's work notices, so a task is never alerted twice (once from its producer event, once from
 * here).
 */

import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { DomainEventMap, DomainEventName } from '@kernel/events';
import type { TaskDocument } from './model';

/** The facts `task.opened`, `task.overdue` and `task.due_soon` carry about a task: one shape, built in one place. */
export const taskFactOf = (
    task: Pick<TaskDocument, '_id' | 'kind' | 'routeSet' | 'category' | 'work'>
): DomainEventMap['task.opened'] => ({
    tenantId: DEPLOYMENT_TENANT_ID,
    taskId: String(task._id),
    kind: task.kind,
    routeSet: task.routeSet,
    ...(task.category ? { category: task.category } : {}),
    ...(task.work ? { work: task.work } : {})
});

/** The event name listeners subscribe to; the payload is in `DomainEventMap`. */
export const TASK_OPENED = 'task.opened' satisfies DomainEventName;

/** The event name for a task passing its due date. */
export const TASK_OVERDUE = 'task.overdue' satisfies DomainEventName;

/** The event name for a task about to pass its due date. */
export const TASK_DUE_SOON = 'task.due_soon' satisfies DomainEventName;

/** The event name for a task handed to one person. */
export const TASK_ASSIGNED = 'task.assigned' satisfies DomainEventName;
