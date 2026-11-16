/**
 * @module
 * A withdrawal before dispatch: `orders`' own cancel (which already refunds in full and releases
 * the stock hold) plus a `Return` written closed at birth — no lines, since no goods are expected
 * back, the refund owed, the Art. 11a acknowledgement mailed. One refund path; the record is the
 * dated proof of the withdrawal. Staff record the one a buyer stated by phone, email or letter the
 * same way, with the day it was stated and the channel on the record.
 *
 * @see docs/modules/returns.md#the-withdrawal-button
 */

import { padDecimal } from '@domain-primitives/money';
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
import type { ResponseReject } from '@infrastructure/http/response';
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
const refundOwedOn = (order: OrderDocument): string =>
    order.paidAt ? orderTotal(order) : padDecimal('0', order.currency);

/**
 * The record of a withdrawal: closed at birth, no lines (nothing is coming back), the full refund
 * owed. The cancel's own pending-refund marker and the payment sweep carry the money; this row is
 * the dated proof of what the customer asked for.
 *
 * @param order - the order that is being withdrawn from
 * @param opener - when the buyer stated it, how, and the staff member recording it, if any
 */
const withdrawalRow = (order: OrderDocument, opener: Opener): Partial<ReturnDocument> => {
    const now = new Date();
    return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        currency: order.currency,
        status: 'closed',
        reason: 'withdrawal',
        lines: [],
        returnPostage: returnPostagePayer(),
        requestedAt: opener.statement.requestedAt,
        ...(opener.statement.statedVia ? { statedVia: opener.statement.statedVia } : {}),
        openedBy: opener.staffId === undefined ? 'buyer' : 'staff',
        decidedAt: now,
        closedAt: now,
        refundAmount: refundOwedOn(order)
    };
};

/**
 * What the transaction decided: the cancel's refusal, or the record it wrote and the cancel's
 * after-commit step.
 */
type Withdrawn =
    | { canceled: ResponseReject }
    | { created: ReturnDocument; settle: () => Promise<unknown> };

/**
 * The withdrawal's one transaction, under the order's lock row like a remainder cancel: the order
 * is canceled (status, stock, `order.canceled` row), the Return is written closed, and its
 * `return.requested` and `return.closed` rows land in that order. A crash between the pieces
 * leaves neither — never a canceled order without its dated record, nor a record of a withdrawal
 * that did not cancel. A refused cancel (a shipment landed first) writes nothing.
 *
 * @param order - the order being withdrawn from
 * @param opener - when the buyer stated it, how, and the staff member recording it, if any
 * @param authContext - the buyer, or the staff member
 * @param context - for audit
 */
const cancelAndRecord = (
    order: OrderDocument,
    opener: Opener,
    authContext: AuthContext,
    context: CallerContext
): Promise<Withdrawn> =>
    withTransaction(async (session): Promise<Withdrawn> => {
        const orderId = String(order._id);
        await returnRepository.lockOrder(orderId, session);
        const canceled = await orderService.withdrawWithin(
            session,
            orderId,
            authContext,
            context,
            opener.staffId !== undefined,
            opener.statement.requestedAt
        );
        if (!canceled.success) return { canceled };

        const created = await returnRepository.create(withdrawalRow(order, opener), session);
        await enqueueRequested(created, session);
        await enqueueClosed(created, session);
        return { created, settle: canceled.settle };
    });

/**
 * A withdrawal from an order the shop has started on, when some of it is goods Art. 16 excludes
 * (made to order): the eligible shipment groups are canceled, one `kind: cancellation` return
 * each, and the made-to-order group stays — the shop's work on it is not the buyer's to cancel.
 * The order itself stays `processing`.
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
 * A withdrawal before dispatch: cancel and refund the order in full, record a return closed at
 * birth, and acknowledge it (the one mail about the withdrawal itself, with no postage line; the
 * refund's own `order-refunded` mail follows when the money settles).
 *
 * Cancel:  once the shop has started on made-to-order goods (`processing`), only the eligible
 *          shipment groups are canceled instead ({@link withdrawEligibleGroups}).
 * Race:    a shipment can land between the read and the cancel; the cancel then refuses and the
 *          withdrawal is opened again as a return, whose refund waits for the goods.
 * Staff:   need `create:Refund` (the money goes back) and `update:Order` (the cancel); the cancel
 *          runs on the operator's scope, the record names the day the buyer stated it, and the
 *          timeline names the staff member.
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

    return cancelAndRecord(order, opener, authContext, context).then((done) => {
        if ('canceled' in done)
            /**
             * Not `ownOrder`: a staff member reads the order's new state through the same door
             * that let them in, so the race falls back to a return for them too.
             */
            return openableOrder(input.orderId, authContext).then((fresh) =>
                fresh && !isBeforeDispatch(fresh.order) ? openAsReturn() : done.canceled
            );

        nudgeOutbox();
        recordOpened(order, done.created, context);
        return done.settle().then(() => opened(done.created));
    });
};
