/**
 * @module
 * What opening a return answers with, and the refusals and writes both ways of opening one share —
 * `create.ts` (goods coming back) and `cancel-remainder.ts` (an unshipped remainder, cancelled).
 * One home, so neither imports the other.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { enqueueOutboxEvent, type OutboxAnnouncement } from '@kernel/outbox';
import type { OrderDocument } from '@modules/orders';
import type { CallerContext, ReturnKind } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_CLOSED, RETURN_DECIDED, RETURN_REQUESTED } from '../events';
import type {
    ReturnReason,
    ProductQuantity,
    StaffStatementChannel,
    Statement,
    StatementVerdict
} from '../domain';

/** What a customer sends to open a return or withdraw. */
export interface CreateReturnInput {
    orderId: string;
    reason: ReturnReason;
    /** `return` (the default) sends goods back; `cancellation` cancels a fulfillment order's remainder. */
    kind?: ReturnKind;
    /** The fulfillment order whose remainder is cancelled — exactly when `kind` is `cancellation`. */
    fulfillmentOrderId?: string;
    note?: string;
    /** Absent means everything that shipped and is still left to return. Never with a cancellation. */
    lines?: ProductQuantity[];
    /** Staff only: when the buyer asked, or stated a withdrawal. See `checkStatement`. */
    requestedAt?: Date;
    /** Staff only, on a withdrawal: how the buyer stated it. */
    statedVia?: StaffStatementChannel;
}

/** Who opens a return, and what the buyer stated: shared by the paths that write one. */
export interface Opener {
    /** The date, and for a withdrawal the channel, the return is written with. */
    statement: Statement;
    /** The staff member opening it on the buyer's behalf, absent when the buyer does. */
    staffId: string | undefined;
}

/** What {@link createReturn} answers with: a refusal, or the return that was written (201). */
export type CreateReturnOutcome = ResponseSuccess<ReturnDocument> | ResponseReject;

/**
 * The answer for a return just written: a 201 whose message says what happened. A cancellation
 * gave back what had not shipped, a return closed at birth was a withdrawal that cancelled and
 * refunded the order, anything else waits for its goods.
 * @param created - the return that was written
 */
export const opened = (created: ReturnDocument): CreateReturnOutcome =>
    generateSuccess(created, 201);

/** The 409 for an order a return cannot be opened on, with a stable code the client can act on. */
export const notReturnable = (): CreateReturnOutcome =>
    generateReject(409, [
        {
            code: ERROR_CODES.RETURN_ORDER_NOT_RETURNABLE,
            message: t('returns.order-not-returnable')
        }
    ]);

/**
 * The 409 for a reason whose period has ended: the withdrawal period for a withdrawal or a
 * goodwill return, the two-year guarantee for a defect or a wrong item. One code, the reason
 * picking the sentence.
 * @param guarantee - whether the reason was a defect or a wrong item
 */
export const windowClosed = (guarantee = false): CreateReturnOutcome =>
    generateReject(409, [
        {
            code: ERROR_CODES.RETURN_WINDOW_CLOSED,
            message: t(guarantee ? 'returns.guarantee-ended' : 'returns.window-closed')
        }
    ]);

/**
 * The 422 for a line that cannot be returned — one shape, with the reason picking the sentence.
 * @param reason - which check failed
 */
export const badLines = (
    reason: 'nothing-returnable' | 'unknown-product' | 'too-many' | 'excluded'
): CreateReturnOutcome => {
    const message = {
        'nothing-returnable': t('returns.nothing-returnable'),
        'unknown-product': t('returns.line-unknown-product'),
        'too-many': t('returns.line-too-many'),
        excluded: t('returns.line-excluded')
    }[reason];
    return generateReject(422, [{ code: ERROR_CODES.RETURN_LINES_INVALID, message }]);
};

/** The 422 for a cancellation that names no fulfillment order, sends lines, or a return that names one. */
export const badCancellation = (): CreateReturnOutcome =>
    generateReject(422, [
        {
            code: ERROR_CODES.RETURN_CANCELLATION_INVALID,
            message: t('returns.cancellation-invalid')
        }
    ]);

/**
 * The 422 for staff naming `withdrawal`: that reason is the buyer's own right, so it is never
 * written on someone else's behalf. The caller may cancel; only the body is wrong for their role.
 */
export const withdrawalIsTheBuyers = (): CreateReturnOutcome =>
    generateReject(422, [
        {
            code: ERROR_CODES.RETURN_CANCELLATION_INVALID,
            message: t('returns.cancellation-withdrawal-buyer-only')
        }
    ]);

/**
 * The 422 for a date or a channel that cannot stand: missing where staff must give it, given by the
 * buyer or on a reason it does not belong to, in the future, or before the order existed. A field
 * error, so a form puts it on the field.
 * @param verdict - which field failed, and why
 */
export const badStatement = (
    verdict: Extract<StatementVerdict, { ok: false }>
): CreateReturnOutcome =>
    generateReject(422, [
        fieldError(
            verdict.field,
            t(`returns.statement-${verdict.reason}`),
            ERROR_CODES.RETURN_STATEMENT_INVALID
        )
    ]);

/**
 * The 403 for a staff caller without a key a staff act needs (`create:Refund` for money out,
 * `update:Order` for the cancel behind a withdrawal before dispatch). Audited, since no route guard
 * can see this refusal: the keys depend on what the order turns out to be.
 *
 * @param order - the order the act was aimed at
 * @param permission - the key that was missing, e.g. `create:Refund`
 * @param context - the caller, for the audit entry
 */
export const forbidden = (
    order: OrderDocument,
    permission: string,
    context: CallerContext
): CreateReturnOutcome => {
    auditForbidden(context, {
        targetType: 'order',
        targetId: String(order._id),
        metadata: { reason: 'missing_permission', permission }
    });

    return generateReject(403, [t('generic.error-forbidden')]);
};

/** The 409 for a remainder with nothing left to cancel, or an order with nothing shipped yet. */
export const nothingToCancel = (): CreateReturnOutcome =>
    generateReject(409, [
        {
            code: ERROR_CODES.RETURN_NOTHING_TO_CANCEL,
            message: t('returns.nothing-to-cancel')
        }
    ]);

/**
 * Writes `return.requested` for a return just created — in the creating transaction, so the
 * event exists exactly when the return does. Keyed on the order: its events stay in order.
 * @param created - the return just written
 * @param session - the transaction that wrote it
 */
export const enqueueRequested = (
    created: ReturnDocument,
    session: ClientSession
): Promise<unknown> =>
    enqueueOutboxEvent(
        RETURN_REQUESTED,
        {
            returnId: String(created._id),
            orderId: String(created.orderId),
            reason: created.reason,
            requestedAt: created.requestedAt.toISOString(),
            ...(created.statedVia ? { statedVia: created.statedVia } : {})
        },
        String(created.orderId),
        session
    );

/**
 * Writes `return.decided{approved}` for a return opened already approved by staff — in the creating
 * transaction, right after `return.requested`, so the buyer hears once, with the return address.
 * @param created - the return just written
 * @param session - the transaction that wrote it
 */
export const enqueueApproved = (
    created: ReturnDocument,
    session: ClientSession
): Promise<unknown> =>
    enqueueOutboxEvent(
        RETURN_DECIDED,
        {
            returnId: String(created._id),
            orderId: String(created.orderId),
            decision: 'approved'
        },
        String(created.orderId),
        session
    );

/**
 * The `return.closed` announcement for a return that just closed — one payload for the three ways
 * a return closes (goods refunded, a withdrawal before dispatch, a remainder cancel). Keyed on the
 * order, like every return event.
 * @param closed - the return, closed
 */
export const returnClosedEvent = (
    closed: ReturnDocument
): OutboxAnnouncement<typeof RETURN_CLOSED> => ({
    name: RETURN_CLOSED,
    payload: {
        returnId: String(closed._id),
        orderId: String(closed.orderId),
        refundAmount: closed.refundAmount ?? 0,
        currency: closed.currency
    },
    aggregateId: String(closed.orderId)
});

/**
 * Writes `return.closed` for a return born closed — in the creating transaction, like
 * {@link enqueueRequested}.
 * @param created - the return just written
 * @param session - the transaction that wrote it
 */
export const enqueueClosed = (
    created: ReturnDocument,
    session: ClientSession
): Promise<unknown> => {
    const { name, payload, aggregateId } = returnClosedEvent(created);
    return enqueueOutboxEvent(name, payload, aggregateId, session);
};

/**
 * The audit row a new return leaves behind, whatever shape it has. Its events were written with
 * the return itself.
 * @param order - the order the return is about
 * @param created - the return just written
 * @param context - for audit
 */
export const recordOpened = (
    order: OrderDocument,
    created: ReturnDocument,
    context: CallerContext
): void => {
    recordAudit(context, {
        action: returnsAuditActions.RETURN_REQUESTED,
        outcome: 'success',
        targetType: 'return',
        targetId: String(created._id),
        metadata: {
            orderId: String(order._id),
            reason: created.reason,
            // Staff acting for the buyer: the row says so, next to the staff member it names.
            ...(created.openedBy === 'staff' ? { onBehalfOfBuyer: true } : {})
        }
    });
};
