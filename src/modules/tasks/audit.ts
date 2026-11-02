/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. Reads are audited too: task rows carry a stranger's email and free text, so who looked
 * is a data-protection question the public product catalogue's reads never raise. See
 * docs/modules/tasks.md.
 */

/** The audit action vocabulary this module owns. */
export const tasksAuditActions = {
    ADMIN_TASK_VIEWED: 'admin.task.viewed',
    ADMIN_TASK_RESOLVED: 'admin.task.resolved',
    ADMIN_TASK_MARKED_SPAM: 'admin.task.marked_spam',
    ADMIN_TASK_REOPENED: 'admin.task.reopened',
    ADMIN_TASK_ASSIGNED: 'admin.task.assigned',
    ADMIN_TASK_UNASSIGNED: 'admin.task.unassigned',
    ADMIN_TASK_NOTED: 'admin.task.noted',
    ADMIN_TASK_DELETED: 'admin.task.deleted',
    SYSTEM_TASK_OPENED: 'system.task.opened',
    SYSTEM_TASK_CLEARED: 'system.task.cleared'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        tasks: (typeof tasksAuditActions)[keyof typeof tasksAuditActions];
    }
}
