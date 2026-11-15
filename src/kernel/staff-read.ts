/**
 * @module
 * The audit entry for staff reading someone else's record: `admin.<resource>.viewed`. A customer
 * reading their own order is not an event, so only a caller holding the resource's staff read rule
 * (`display:<Subject>` or `read:<Subject>`) is recorded, and not when the record is their own.
 * "Own" means a session caller's own record: a key shares its minter's id, so a key reading its
 * minter is recorded. Detail reads only — a list
 * would write one entry per page, and the entry that matters is the one naming a record.
 *
 * @see docs/understand/defences/authorization.md#a-rule-is-not-a-licence-over-everyone
 */

import type { Request } from 'express';
import { heldRules } from '@kernel/ability';
import type { PermissionRuleId } from '@kernel/permissions';
import { callerContextOf } from '@infrastructure/http/request';
import { recordAudit, type AuditAction } from '@infrastructure/observability/audit';

/** What one staff read names. */
export interface StaffReadTarget {
    /** The wide-read permission key whose holder is "staff" for this resource, e.g. `display:Order`. */
    key: PermissionRuleId;
    /** The `admin.<resource>.viewed` action to record. */
    action: AuditAction;
    /** The resource kind, e.g. `order`. */
    targetType: string;
    /** The record's id. */
    targetId: string;
    /**
     * The person whose data the record holds, when there is one: the audit row stores it as
     * `subjectId`, which is what lets "who looked at my data" be one query. A session caller's
     * read of their own record is not recorded. Absent for a guest's order and anything else
     * that is not a person's.
     */
    subjectId?: string;
}

/**
 * Why staff open each kind of record, in words a data subject can read: the "purpose" half of
 * what the person is told when they ask who consulted their data (GDPR Art. 15, CJEU C-579/21
 * gives dates and purposes, not the employee). Doubles as the list of actions that count as a
 * consultation, so a new `admin.<resource>.viewed` is added here or it never reaches the export.
 *
 * @see docs/modules/audit-logs.md#the-person-can-see-who-looked
 */
export const STAFF_READ_PURPOSES = {
    'admin.order.viewed': 'handling your order',
    'admin.user.viewed': 'handling your account',
    'admin.return.viewed': 'handling your return',
    'admin.task.viewed': 'handling your request',
    'admin.invoice.viewed': 'handling your invoice',
    'admin.credit_note.viewed': 'handling your credit note'
} as const satisfies Partial<Record<AuditAction, string>>;

/**
 * Record a staff read of another person's record. A no-op for a caller without the wide-read key
 * and for a session caller's read of their own record.
 *
 * @param request - the detail request, already past `getAuth`
 * @param target - what was read, and by which key staff is recognised
 */
export const recordStaffRead = (request: Request, target: StaffReadTarget): void => {
    const { caller } = request;
    if (!caller || !heldRules(caller).has(target.key)) return;
    // A key carries its minter's id but is not the minter: only a session reads its own record.
    if (
        request.credentialId === undefined &&
        target.subjectId !== undefined &&
        target.subjectId === caller.id
    )
        return;

    recordAudit(callerContextOf(request), {
        action: target.action,
        outcome: 'success',
        targetType: target.targetType,
        targetId: target.targetId,
        subjectId: target.subjectId
    });
};
