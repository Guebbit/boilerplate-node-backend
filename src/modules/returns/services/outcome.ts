/**
 * @module
 * What opening a return answers with, and the refusals and writes both ways of opening one share —
 * `create.ts` (goods coming back) and `cancel-remainder.ts` (an unshipped remainder, cancelled).
 * One home, so neither imports the other.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { enqueueOutboxEvent } from '@kernel/outbox';
import type { OrderDocument } from '@modules/orders';
import type { CallerContext, ReturnKind } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_REQUESTED } from '../events';
import type { ReturnReason, ProductQuantity } from '../domain';

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
}

/** What {@link createReturn} answers with: a refusal, or the return that was written. */
export type CreateReturnOutcome =
    | { kind: 'refused'; reject: ResponseReject }
    | { kind: 'created'; created: ReturnDocument };

/** A refusal, wrapped as an outcome. */
export const refused = (reject: ResponseReject): CreateReturnOutcome => ({
    kind: 'refused',
    reject
});

/** The 409 for an order a return cannot be opened on, with a stable code the client can act on. */
export const notReturnable = (): CreateReturnOutcome =>
    refused(
        generateReject(409, [
            {
                code: ERROR_CODES.RETURN_ORDER_NOT_RETURNABLE,
                message: t('returns.order-not-returnable')
            }
        ])
    );

/** The 409 for a withdrawal after its window closed. */
export const windowClosed = (): CreateReturnOutcome =>
    refused(
        generateReject(409, [
            { code: ERROR_CODES.RETURN_WINDOW_CLOSED, message: t('returns.window-closed') }
        ])
    );

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
    return refused(generateReject(422, [{ code: ERROR_CODES.RETURN_LINES_INVALID, message }]));
};

/** The 422 for a cancellation that names no fulfillment order, sends lines, or a return that names one. */
export const badCancellation = (): CreateReturnOutcome =>
    refused(
        generateReject(422, [
            {
                code: ERROR_CODES.RETURN_CANCELLATION_INVALID,
                message: t('returns.cancellation-invalid')
            }
        ])
    );

/** The 409 for a remainder with nothing left to cancel, or an order with nothing shipped yet. */
export const nothingToCancel = (): CreateReturnOutcome =>
    refused(
        generateReject(409, [
            {
                code: ERROR_CODES.RETURN_NOTHING_TO_CANCEL,
                message: t('returns.nothing-to-cancel')
            }
        ])
    );

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
            reason: created.reason
        },
        String(created.orderId),
        session
    );

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
        metadata: { orderId: String(order._id), reason: created.reason }
    });
};
