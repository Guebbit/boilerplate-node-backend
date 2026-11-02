/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. All three are internal:
 * no AsyncAPI channel and no webhook carries them. `notifications` turns them into the staff's
 * work notices, so a task is never alerted twice (once from its producer event, once from here).
 */

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

/** See `DomainEventMap['task.opened']` above. */
export const TASK_OPENED = 'task.opened';

/** See `DomainEventMap['task.overdue']` above. */
export const TASK_OVERDUE = 'task.overdue';

/** See `DomainEventMap['task.assigned']` above. */
export const TASK_ASSIGNED = 'task.assigned';
