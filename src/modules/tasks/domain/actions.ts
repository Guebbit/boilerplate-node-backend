/**
 * @module
 * What a caller may do to one task, decided on the server so no client re-implements the
 * lifecycle. Pure: the service resolves the caller's standing once and hands the facts in.
 */

import { TaskStatus } from '@types';
import { isOpen } from './lifecycle';

/** What the caller's standing amounts to for one task. */
export interface ActionFacts {
    status: TaskStatus;
    /** Holds `update:Task`, and the task's route set when it is a system task. */
    mayWork: boolean;
    /** Holds `delete:Task`, and the task's route set when it is a system task. */
    mayDelete: boolean;
    assigned: boolean;
}

/** The flags the wire carries as `actions`. */
export interface TaskActionFlags {
    resolve: boolean;
    markSpam: boolean;
    reopen: boolean;
    assign: boolean;
    unassign: boolean;
    note: boolean;
    delete: boolean;
}

/**
 * Each flag needs the right to work the task and a status the act can run from.
 *
 * @param facts - the task's status and the caller's standing
 */
export const actionsOf = ({
    status,
    mayWork,
    mayDelete,
    assigned
}: ActionFacts): TaskActionFlags => ({
    resolve: mayWork && status !== TaskStatus.resolved,
    markSpam: mayWork && status !== TaskStatus.spam,
    reopen: mayWork && !isOpen(status),
    assign: mayWork && isOpen(status),
    unassign: mayWork && isOpen(status) && assigned,
    note: mayWork,
    delete: mayDelete
});
