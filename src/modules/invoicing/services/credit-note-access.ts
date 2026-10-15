/**
 * @module
 * Who may see an order's credit notes: the buyer, or staff who may also read the money. A credit
 * note carries the refund amount and the billing address, so being able to read the ORDER (the
 * warehouse packs everyone's) is not enough: the warehouse is refused the refund list for the same
 * reason (`display:Payment`).
 */

import { holds } from '@kernel/ability';
import { callerForSubject } from '@kernel/permissions';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { isBuyer, type OrderDocument } from '@modules/orders';
import type { AuthContext, CallerContext } from '@types';

/**
 * Is this caller one who may see the order's credit notes? A refusal is audited as a forbidden
 * attempt, since no route guard sees it: the route serves buyers and staff alike.
 *
 * @param order - the order, already read through the caller's own scope
 * @param authContext - the caller
 * @param context - the caller, for the audit entry
 * @returns whether the caller may see the credit notes
 */
export const mayReadCreditNotes = (
    order: OrderDocument,
    authContext: AuthContext | undefined,
    context: CallerContext
): boolean => {
    if (!authContext) return false;
    if (isBuyer(order, authContext)) return true;
    if (holds(callerForSubject(authContext, 'Payment'), 'display', 'Payment')) return true;

    auditForbidden(context, {
        targetType: 'order',
        targetId: String(order._id),
        metadata: { reason: 'missing_permission', permission: 'display:Payment' }
    });
    return false;
};
