/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. All four are
 * internal: no AsyncAPI channel and no webhook carries them. `notifications` turns them into the
 * staff's work notices, so a task is never alerted twice (once from its producer event, once from
 * here).
 */

import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import type { DomainEventMap } from '@kernel/events';
import type { TaskDocument } from './model';

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A task was inserted (not a repeat of an open one, not spam). Closed codes and ids only:
         * the task page has the rest, and no visitor text rides a bus the outbox persists.
         */
        'task.opened': {
            tenantId: string;
            taskId: string;
            kind: string;
            /** The permission set that works it; its holders are who hear of it. */
            routeSet: string;
            /** A contact task's category, when the visitor chose one. */
            category?: string;
            /** The staff screen that does the work, when the opener named one: see `TaskDocument.work`. */
            work?: string;
        };

        /**
         * An open task passed its due date and was claimed by the overdue sweep: said once per
         * task, never again. Same shape and same audience as `task.opened`.
         */
        'task.overdue': {
            tenantId: string;
            taskId: string;
            kind: string;
            /** The permission set that works it; its holders are who hear of it. */
            routeSet: string;
            /** A contact task's category, when the visitor chose one. */
            category?: string;
            /** The staff screen that does the work, when the opener named one: see `TaskDocument.work`. */
            work?: string;
        };

        /**
         * An open task is within three days of its due date and was claimed by the same sweep:
         * said once per task, never again. Same shape and same audience as `task.opened`.
         */
        'task.due_soon': {
            tenantId: string;
            taskId: string;
            kind: string;
            /** The permission set that works it; its holders are who hear of it. */
            routeSet: string;
            /** A contact task's category, when the visitor chose one. */
            category?: string;
            /** The staff screen that does the work, when the opener named one: see `TaskDocument.work`. */
            work?: string;
        };

        /** Someone gave a task to a colleague (taking your own task does not emit this). */
        'task.assigned': {
            tenantId: string;
            taskId: string;
            kind: string;
            routeSet: string;
            /** Who now holds it, and the only person told. */
            assigneeId: string;
            /** ISO instant of the assignment: a task handed back and forth tells each time. */
            assignedAt: string;
        };
    }
}

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
export const TASK_OPENED = 'task.opened';

/** The event name for a task passing its due date. */
export const TASK_OVERDUE = 'task.overdue';

/** The event name for a task about to pass its due date. */
export const TASK_DUE_SOON = 'task.due_soon';

/** The event name for a task handed to one person. */
export const TASK_ASSIGNED = 'task.assigned';
