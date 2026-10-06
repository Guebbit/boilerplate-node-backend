/**
 * @module
 * The audit entry for staff reading someone else's record: `admin.<resource>.viewed`. A customer
 * reading their own order is not an event, so only a caller holding the resource's wide-read key
 * (`*.any.read`) is recorded, and not when the record is their own. Detail reads only — a list
 * would write one entry per page, and the entry that matters is the one naming a record.
 *
 * See: docs/theory/defences/authentication.md
 */

import type { Request } from 'express';
import { heldKeys } from '@kernel/ability';
import { callerContextOf } from '@infrastructure/http/request';
import { recordAudit, type AuditAction } from '@infrastructure/observability/audit';

/** What one staff read names. */
export interface StaffReadTarget {
    /** The wide-read permission key whose holder is "staff" for this resource, e.g. `orders.any.read`. */
    key: string;
    /** The `admin.<resource>.viewed` action to record. */
    action: AuditAction;
    /** The resource kind, e.g. `order`. */
    targetType: string;
    /** The record's id. */
    targetId: string;
    /** Whose record it is, when known; a read of the caller's own record is not recorded. */
    ownerId?: string;
}

/**
 * Record a staff read of another person's record. A no-op for a caller without the wide-read key
 * and for a read of the caller's own record.
 *
 * @param request - the detail request, already past `getAuth`
 * @param target - what was read, and by which key staff is recognised
 */
export const recordStaffRead = (request: Request, target: StaffReadTarget): void => {
    const { caller } = request;
    if (!caller || !heldKeys(caller).has(target.key)) return;
    if (target.ownerId !== undefined && target.ownerId === caller.id) return;

    recordAudit(callerContextOf(request), {
        action: target.action,
        outcome: 'success',
        target_type: target.targetType,
        target_id: target.targetId
    });
};
