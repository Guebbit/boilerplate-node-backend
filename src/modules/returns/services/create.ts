/**
 * @module
 * Opening a return — and the withdrawal button, which is this same call. It always answers with a
 * `Return`; where the goods are decides what that record is:
 *
 * - Before dispatch the order is still in the shop's hands, so a withdrawal is `orders`' own cancel
 *   — which already refunds in full and releases the stock hold — plus a `Return` written closed at
 *   birth: no lines (no goods are expected back), the refund owed, the Art. 11a acknowledgement
 *   mailed. One refund path; the record is the dated proof of the withdrawal.
 * - Once the goods have shipped there is something to send back: a return is written open, with
 *   the lines and quantities coming back, and staff see it.
 *
 * See: docs/modules/returns.md#the-withdrawal-button
 */

import { Types } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { emitDomainEvent } from '@kernel/events';
import {
    orderService,
    orderCurrency,
    orderTotal,
    isBeforeDispatch,
    isExcludedFromWithdrawal,
    returnAddress,
    returnPostagePayer
} from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext, CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_CLOSED, RETURN_REQUESTED } from '../events';
import {
    type ReturnReason,
    QUANTITY_HOLDING_RETURN_STATUSES,
    checkRequestedLines,
    initialStatusFor,
    returnableQuantities
} from '../domain';
import type { RequestedLine } from '../domain';
import { mailReturnNotice } from './notify';
import { syncReturnStatus } from './projection';

/** What a customer sends to open a return or withdraw. */
export interface CreateReturnInput {
    orderId: string;
    reason: ReturnReason;
    note?: string;
    /** Absent means everything on the order that is still left to return. */
    lines?: RequestedLine[];
}

/** What {@link createReturn} answers with: a refusal, or the return that was written. */
export type CreateReturnOutcome =
    | { kind: 'refused'; reject: ResponseReject }
    | { kind: 'created'; created: ReturnDocument };

/** A refusal, wrapped as an outcome. */
const refused = (reject: ResponseReject): CreateReturnOutcome => ({ kind: 'refused', reject });

/** The 409 for an order a return cannot be opened on, with a stable code the client can act on. */
const notReturnable = (): CreateReturnOutcome =>
    refused(
        generateReject(409, [
            {
                code: ERROR_CODES.RETURN_ORDER_NOT_RETURNABLE,
                message: t('returns.order-not-returnable')
            }
        ])
    );

/** The 409 for a withdrawal after its window closed. */
const windowClosed = (): CreateReturnOutcome =>
    refused(
        generateReject(409, [
            { code: ERROR_CODES.RETURN_WINDOW_CLOSED, message: t('returns.window-closed') }
        ])
    );

/**
 * The 422 for a line that cannot be returned — one shape, with the reason picking the sentence.
 * @param reason - which check failed
 */
const badLines = (
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

/**
 * The buyer's own order, or `undefined`. Ownership, not just visibility: an operator who can read
 * any order still cannot exercise a consumer's right on their behalf.
 * @param orderId - the order
 * @param authContext - the caller
 */
const ownOrder = (orderId: string, authContext: AuthContext): Promise<OrderDocument | undefined> =>
    orderService
        .getById(orderId, orderService.callerScope(authContext))
        .then((order) => (order && String(order.userId) === authContext.id ? order : undefined));

/**
 * What a withdrawal before dispatch hands back: the whole order, if anything was paid. An order
 * nobody paid for owes nothing — the cancel releases its hold and that is all.
 * @param order - the order being withdrawn from
 */
const refundOwedOn = (order: OrderDocument): number =>
    order.paidAt
        ? orderTotal({
              items: order.items,
              shippingCost: order.shippingCost,
              currency: orderCurrency(order)
          })
        : 0;

/**
 * The facts a new return leaves behind, whatever shape it has: the audit row, and the event
 * `webhooks` fans out.
 * @param order - the order the return is about
 * @param created - the return just written
 * @param context - for audit
 */
const recordOpened = (
    order: OrderDocument,
    created: ReturnDocument,
    context: CallerContext
): void => {
    recordAudit(context, {
        action: returnsAuditActions.RETURN_REQUESTED,
        outcome: 'success',
        target_type: 'return',
        target_id: String(created._id),
        metadata: { orderId: String(order._id), reason: created.reason }
    });
    void emitDomainEvent(RETURN_REQUESTED, {
        returnId: String(created._id),
        orderId: String(order._id),
        reason: created.reason
    });
};

/**
 * Write the record of a withdrawal the cancel already settled: closed at birth, no lines (nothing
 * is coming back), the full refund owed. The cancel's own pending-refund marker and the payment
 * sweep carry the money; this row is the dated proof of what the customer asked for.
 *
 * @param order - the order that was withdrawn from
 * @param context - for audit
 */
const writeWithdrawalRecord = (
    order: OrderDocument,
    context: CallerContext
): Promise<ReturnDocument> => {
    const now = new Date();
    return returnRepository
        .create({
            orderId: order._id,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
            currency: orderCurrency(order),
            status: 'closed',
            reason: 'withdrawal',
            lines: [],
            returnPostage: returnPostagePayer(),
            decidedAt: now,
            closedAt: now,
            refundAmount: refundOwedOn(order)
        })
        .then((created) => {
            recordOpened(order, created, context);
            void emitDomainEvent(RETURN_CLOSED, {
                returnId: String(created._id),
                orderId: String(order._id),
                refundAmount: created.refundAmount ?? 0,
                currency: created.currency
            });
            return created;
        });
};

/**
 * A withdrawal before dispatch: cancel the order, refund it in full, record the withdrawal as a
 * return closed at birth, and acknowledge it. Exactly one mail goes out about the withdrawal — the
 * acknowledgement, with no postage line since no goods are expected; `return-closed` is for a
 * return whose goods came back.
 *
 * @param order - the order being withdrawn from
 * @param authContext - the buyer
 * @param context - for audit
 */
const withdrawBeforeDispatch = (
    order: OrderDocument,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> =>
    orderService
        .cancelById(String(order._id), authContext, { withdrawal: true }, context)
        .then((cancelled) => {
            if (!cancelled.success) return refused(cancelled);

            return writeWithdrawalRecord(order, context).then((created) =>
                mailReturnNotice('withdrawal-acknowledged', order, {
                    at: created.createdAt ?? new Date()
                }).then((): CreateReturnOutcome => ({ kind: 'created', created }))
            );
        });

/**
 * The lines already coming back on an order — what a new return's quantities are checked against.
 * @param orderId - the order
 */
const alreadyReturned = (orderId: string): Promise<RequestedLine[]> =>
    returnRepository.findByOrderId(orderId).then((returns) =>
        returns
            .filter(({ status }) => QUANTITY_HOLDING_RETURN_STATUSES.includes(status))
            .flatMap(({ lines }) =>
                lines.map(({ productId, quantity }) => ({
                    productId: String(productId),
                    quantity
                }))
            )
    );

/**
 * Write the return once its lines are decided: freeze what is coming back, then announce it.
 *
 * @param order - the order the goods came from
 * @param input - the customer's request
 * @param lines - the lines {@link checkRequestedLines} accepted
 * @param context - for audit
 */
const writeReturn = (
    order: OrderDocument,
    input: CreateReturnInput,
    lines: readonly RequestedLine[],
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    const byProduct = new Map(order.items.map((item) => [String(item.product._id), item]));

    return returnRepository
        .create({
            orderId: order._id,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
            currency: orderCurrency(order),
            status: initialStatusFor(input.reason),
            reason: input.reason,
            ...(input.note ? { note: input.note } : {}),
            lines: lines.map(({ productId, quantity }) => {
                // `checkRequestedLines` only accepts products the order holds, so this is present.
                const item = byProduct.get(productId)!;
                return {
                    productId: new Types.ObjectId(productId),
                    quantity,
                    title: item.product.title,
                    unitPrice: item.product.price
                };
            }),
            returnPostage: returnPostagePayer(),
            // A withdrawal is opened already decided — there is nothing for staff to decide.
            ...(input.reason === 'withdrawal' ? { decidedAt: new Date() } : {})
        })
        .then((created) => announceOpened(order, created, context));
};

/**
 * Everything opening a return unlocks: the acknowledgement mail — the Art. 11a one for a
 * withdrawal, a plain "received" for any other reason — after the order's return status is
 * brought in step.
 * @param order - the order the goods came from
 * @param created - the return just written
 * @param context - for audit
 */
const announceOpened = (
    order: OrderDocument,
    created: ReturnDocument,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    recordOpened(order, created, context);

    return syncReturnStatus(String(order._id))
        .then(() =>
            mailReturnNotice(
                created.reason === 'withdrawal' ? 'withdrawal-acknowledged' : 'return-requested',
                order,
                {
                    returnPostage: created.returnPostage,
                    at: created.createdAt ?? new Date(),
                    // A withdrawal is approved from the start, so the customer is told where to send the
                    // goods in the same mail; any other reason hears it once staff approve.
                    ...(created.reason === 'withdrawal' ? { returnAddress: returnAddress() } : {})
                }
            )
        )
        .then((): CreateReturnOutcome => ({ kind: 'created', created }));
};

/**
 * Open a return, or withdraw — the one call behind `POST /returns`.
 *
 * @param input - the customer's request
 * @param authContext - the buyer; only they may exercise the right
 * @param context - for audit
 * @returns the outcome: refused, or the return written — open for goods on their way back, closed
 *   at birth for a withdrawal before dispatch
 */
export const createReturn = (
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> =>
    ownOrder(input.orderId, authContext).then((order) => {
        if (!order) return refused(generateReject(404, [t('returns.order-not-found')]));

        const now = new Date();
        if (order.withdrawUntil && now.getTime() > order.withdrawUntil.getTime())
            return windowClosed();

        // Art. 16: goods the product marks as excluded cannot be withdrawn from. A cancel before
        // dispatch takes the whole order, so one such line keeps the whole withdrawal out.
        const excluded = new Set(
            order.items
                .filter((item) => isExcludedFromWithdrawal(item))
                .map((item) => String(item.product._id))
        );
        const beforeDispatch = isBeforeDispatch(order.status);
        if (input.reason === 'withdrawal' && beforeDispatch)
            return excluded.size > 0
                ? badLines('excluded')
                : withdrawBeforeDispatch(order, authContext, context);

        // Past this point goods are on their way or arrived: `shipped` or `delivered`. Anything
        // else (cancelled, or a non-withdrawal reason before dispatch) has nothing to send back.
        if (beforeDispatch || (order.status !== 'shipped' && order.status !== 'delivered'))
            return notReturnable();

        if (input.lines?.some(({ productId }) => excluded.has(productId)))
            return badLines('excluded');

        return alreadyReturned(input.orderId).then((earlier) => {
            const verdict = checkRequestedLines(
                returnableQuantities(
                    order.items
                        .filter((item) => !isExcludedFromWithdrawal(item))
                        .map((item) => ({
                            productId: String(item.product._id),
                            quantity: item.quantity
                        })),
                    earlier
                ),
                input.lines
            );
            return verdict.ok
                ? writeReturn(order, input, verdict.lines, context)
                : badLines(verdict.reason);
        });
    });
