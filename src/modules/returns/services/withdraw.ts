/**
 * @module
 * A withdrawal before dispatch: `orders`' own cancel (which already refunds in full and releases
 * the stock hold) plus a `Return` written closed at birth — no lines, since no goods are expected
 * back, the refund owed, the Art. 11a acknowledgement mailed. One refund path; the record is the
 * dated proof of the withdrawal.
 *
 * See: docs/modules/returns.md#the-withdrawal-button
 */

import { withTransaction } from '@infrastructure/runtime/database';
import { nudgeOutbox } from '@kernel/outbox';
import { deliveryService } from '@modules/delivery';
import {
    hasShopStarted,
    orderService,
    orderTotal,
    isBeforeDispatch,
    isExcludedFromWithdrawal
} from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { returnPostagePayer } from '@modules/shop';
import type { AuthContext, CallerContext } from '@types';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { createCancellation } from './cancel-remainder';
import { ownOrder } from './ownership';
import {
    enqueueClosed,
    enqueueRequested,
    nothingToCancel,
    opened,
    recordOpened,
    type CreateReturnInput,
    type CreateReturnOutcome
} from './outcome';

/**
 * What a withdrawal before dispatch hands back: the whole order, if anything was paid. An order
 * nobody paid for owes nothing — the cancel releases its hold and that is all.
 * @param order - the order being withdrawn from
 */
const refundOwedOn = (order: OrderDocument): number => (order.paidAt ? orderTotal(order) : 0);

/**
 * Write the record of a withdrawal the cancel already settled: closed at birth, no lines (nothing
 * is coming back), the full refund owed. The cancel's own pending-refund marker and the payment
 * sweep carry the money; this row is the dated proof of what the customer asked for. Its
 * `return.requested` and `return.closed` are written with it, in that order.
 *
 * @param order - the order that was withdrawn from
 * @param context - for audit
 */
const writeWithdrawalRecord = (
    order: OrderDocument,
    context: CallerContext
): Promise<ReturnDocument> => {
    const now = new Date();
    return withTransaction((session) =>
        returnRepository
            .create(
                {
                    orderId: order._id,
                    orderNumber: order.orderNumber,
                    currency: order.currency,
                    status: 'closed',
                    reason: 'withdrawal',
                    lines: [],
                    returnPostage: returnPostagePayer(),
                    decidedAt: now,
                    closedAt: now,
                    refundAmount: refundOwedOn(order)
                },
                session
            )
            .then((created) =>
                enqueueRequested(created, session)
                    .then(() => enqueueClosed(created, session))
                    .then(() => created)
            )
    ).then((created) => {
        nudgeOutbox();
        recordOpened(order, created, context);
        return created;
    });
};

/**
 * A withdrawal from an order the shop has started on, when some of it is goods Art. 16 excludes
 * (made to order): the eligible shipment groups are cancelled, one `kind: cancellation` return
 * each, and the made-to-order group stays — the shop's work on it is not the buyer's to cancel
 * (S4 of the Q-W2 decision). The order itself stays `processing`.
 *
 * @param order - the order being withdrawn from
 * @param authContext - the buyer
 * @param context - for audit
 * @returns the last cancellation written, the first refusal, or nothing-to-cancel when no
 *   eligible group is left live
 */
const withdrawEligibleGroups = async (
    order: OrderDocument,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    const orderId = String(order._id);
    const excluded = new Set(
        order.items
            .filter((item) => isExcludedFromWithdrawal(item))
            .map((item) => String(item.product._id))
    );
    const groups = await deliveryService.remainderOptions(orderId, false);
    const eligible = groups.filter(({ lines }) =>
        lines.every(({ productId }) => !excluded.has(productId))
    );

    let outcome: CreateReturnOutcome = nothingToCancel();
    // One after another: each cancel takes the order's lock row.
    for (const group of eligible) {
        outcome = await createCancellation(
            {
                orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: group.fulfillmentOrderId
            },
            authContext,
            context
        );
        if (!outcome.success) return outcome;
    }
    return outcome;
};

/**
 * A withdrawal before dispatch: cancel the order, refund it in full, record the withdrawal as a
 * return closed at birth, and acknowledge it. The acknowledgement is the one mail about the
 * withdrawal itself, with no postage line since no goods are expected; the refund's own
 * `order-refunded` mail follows when the money settles. `return-closed` is for a return whose
 * goods came back.
 *
 * Once the shop has started on an order that holds made-to-order goods (`processing`), only the
 * eligible shipment groups are cancelled instead: see {@link withdrawEligibleGroups}.
 *
 * A shipment can land between the read that said "before dispatch" and the cancel; the cancel then
 * refuses, and the withdrawal is opened again on what the order now is — a return, never a full
 * refund of goods the buyer already holds.
 *
 * @param order - the order being withdrawn from
 * @param input - the customer's request, to open again if the cancel lost a race to a shipment
 * @param authContext - the buyer
 * @param context - for audit
 * @param openAsReturn - opens the same request as a return of goods, for the race above
 */
export const withdrawBeforeDispatch = (
    order: OrderDocument,
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext,
    openAsReturn: () => Promise<CreateReturnOutcome>
): Promise<CreateReturnOutcome> => {
    const bespokeAndStarted =
        hasShopStarted(order.status) && order.items.some((item) => isExcludedFromWithdrawal(item));
    if (bespokeAndStarted) return withdrawEligibleGroups(order, authContext, context);

    return orderService.withdrawById(String(order._id), authContext, context).then((cancelled) => {
        if (!cancelled.success)
            return ownOrder(input.orderId, authContext).then((fresh) =>
                fresh && !isBeforeDispatch(fresh) ? openAsReturn() : cancelled
            );

        return writeWithdrawalRecord(order, context).then(opened);
    });
};
