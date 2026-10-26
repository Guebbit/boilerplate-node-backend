/**
 * @module
 * A withdrawal before dispatch: `orders`' own cancel (which already refunds in full and releases
 * the stock hold) plus a `Return` written closed at birth — no lines, since no goods are expected
 * back, the refund owed, the Art. 11a acknowledgement mailed. One refund path; the record is the
 * dated proof of the withdrawal. Staff record the one a buyer stated by phone, email or letter the
 * same way, with the day it was stated and the channel on the record.
 *
 * See: docs/modules/returns.md#the-withdrawal-button
 */

import { withTransaction } from '@infrastructure/runtime/database';
import { nudgeOutbox } from '@kernel/outbox';
import { callerForSubject } from '@kernel/permissions';
import { holds } from '@kernel/ability';
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
import { openableOrder } from './ownership';
import {
    enqueueClosed,
    enqueueRequested,
    forbidden,
    nothingToCancel,
    opened,
    recordOpened,
    type CreateReturnInput,
    type CreateReturnOutcome,
    type Opener
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
 * @param opener - when the buyer stated it, how, and the staff member recording it, if any
 * @param context - for audit
 */
const writeWithdrawalRecord = (
    order: OrderDocument,
    opener: Opener,
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
                    requestedAt: opener.statement.requestedAt,
                    ...(opener.statement.statedVia
                        ? { statedVia: opener.statement.statedVia }
                        : {}),
                    openedBy: opener.staffId === undefined ? 'buyer' : 'staff',
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
 * @param input - the request, whose stated date and channel ride along on every cancellation
 * @param authContext - the buyer, or the staff member recording the withdrawal
 * @param context - for audit
 * @returns the last cancellation written, the first refusal, or nothing-to-cancel when no
 *   eligible group is left live
 */
const withdrawEligibleGroups = async (
    order: OrderDocument,
    input: CreateReturnInput,
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
                fulfillmentOrderId: group.fulfillmentOrderId,
                ...(input.requestedAt ? { requestedAt: input.requestedAt } : {}),
                ...(input.statedVia ? { statedVia: input.statedVia } : {})
            },
            authContext,
            context
        );
        if (!outcome.success) return outcome;
    }
    return outcome;
};

/**
 * The key a staff member lacks to cancel and refund a whole order on the buyer's behalf, if any:
 * `create:Refund` sends the money back, `update:Order` is the cancel behind it.
 * @param authContext - the staff member
 */
const missingKeyOf = (authContext: AuthContext): string | undefined => {
    if (!holds(callerForSubject(authContext, 'Refund'), 'create', 'Refund')) return 'create:Refund';
    return holds(callerForSubject(authContext, 'Order'), 'update', 'Order')
        ? undefined
        : 'update:Order';
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
 * Staff recording the buyer's withdrawal need `create:Refund` (the money goes back) and
 * `update:Order` (the cancel); the cancel runs on the operator's scope, the record names the day
 * the buyer stated it, and the timeline names the staff member.
 *
 * @param order - the order being withdrawn from
 * @param input - the request, to open again if the cancel lost a race to a shipment
 * @param opener - when the buyer stated it, how, and the staff member recording it, if any
 * @param authContext - the buyer, or the staff member
 * @param context - for audit
 * @param openAsReturn - opens the same request as a return of goods, for the race above
 */
export const withdrawBeforeDispatch = (
    order: OrderDocument,
    input: CreateReturnInput,
    opener: Opener,
    authContext: AuthContext,
    context: CallerContext,
    openAsReturn: () => Promise<CreateReturnOutcome>
): Promise<CreateReturnOutcome> => {
    const bespokeAndStarted =
        hasShopStarted(order.status) && order.items.some((item) => isExcludedFromWithdrawal(item));
    if (bespokeAndStarted) return withdrawEligibleGroups(order, input, authContext, context);

    const byStaff = opener.staffId !== undefined;
    const missing = byStaff ? missingKeyOf(authContext) : undefined;
    if (missing) return Promise.resolve(forbidden(order, missing, context));

    const orderId = String(order._id);
    const cancelling = byStaff
        ? orderService.withdrawOnBuyersBehalfById(orderId, authContext, context)
        : orderService.withdrawById(orderId, authContext, context);
    return cancelling.then((cancelled) => {
        if (!cancelled.success)
            // Not `ownOrder`: a staff member reads the order's new state through the same door
            // that let them in, so the race falls back to a return for them too.
            return openableOrder(input.orderId, authContext).then((fresh) =>
                fresh && !isBeforeDispatch(fresh.order) ? openAsReturn() : cancelled
            );

        return writeWithdrawalRecord(order, opener, context).then(opened);
    });
};
