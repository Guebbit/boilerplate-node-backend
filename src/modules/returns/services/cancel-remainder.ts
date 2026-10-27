/**
 * @module
 * Cancelling what has not shipped yet — a Return of `kind: cancellation`, closed when made. Once
 * something has shipped, an order can no longer be cancelled whole; what remains is cancelled one
 * fulfillment order at a time, by the buyer as part of their withdrawal (CRD recital 40: withdraw
 * before delivery) or by staff under the refund key (Shopify's rule: you refund the unshipped items).
 *
 * `returns` owns it because a remainder cancel moves money, stock and the shipping rule, and only
 * this module already reaches all four. In ONE transaction, under the order's lock row:
 *
 * - `delivery` marks the lines cancelled (and recomputes the order's summary);
 * - `inventory` gives the units back;
 * - the Return row is written, closed, with its refund record.
 *
 * Only the provider call follows the commit, as on receipt: the record is already durable, and a
 * refund the provider refuses stays open for the payment sweep.
 *
 * See: docs/modules/returns.md#cancelling-what-has-not-shipped
 */

import { t } from '@infrastructure/i18n';
import { generateReject } from '@infrastructure/http/response';
import { withTransaction } from '@infrastructure/runtime/database';
import { nudgeOutbox } from '@kernel/outbox';
import { deliveryService, ActRefusal } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { isBuyer, orderService } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { OpenedReturnRefund } from '@modules/payments';
import { FulfillmentCancelReason } from '@types';
import type { AuthContext, CallerContext } from '@types';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { checkStatement } from '../domain';
import type { ProductQuantity, Statement } from '../domain';
import { cancelRefusalOf } from './cancel-right';
import { cancellationRefundOn } from './cancellation-refund';
import { syncReturnStatus } from './projection';
import {
    badCancellation,
    badLines,
    badStatement,
    enqueueClosed,
    forbidden,
    enqueueRequested,
    nothingToCancel,
    recordOpened,
    opened,
    windowClosed,
    type CreateReturnInput,
    type CreateReturnOutcome,
    type Opener
} from './outcome';
import { returnPostagePayer } from '@modules/shop';

/** What the cancellation is made from, once the transaction has decided it. */
interface Cancelled {
    created: ReturnDocument;
    lines: ProductQuantity[];
    /** The refund record opened with the cancel, or `null` when nothing is owed. */
    opened: OpenedReturnRefund | null;
}

/**
 * The Return row of a remainder cancel, closed when made.
 * @param order - the order
 * @param input - the request
 * @param opening - what the buyer stated, and who recorded it when it was staff
 * @param fulfillmentOrderId - the fulfillment order whose remainder was cancelled
 * @param lines - what was cancelled
 * @param breakdown - what the cancel refunds
 */
const rowFor = (
    order: OrderDocument,
    input: CreateReturnInput,
    opening: Opener,
    fulfillmentOrderId: string,
    lines: readonly ProductQuantity[],
    breakdown: { total: number; shipping: number }
): Partial<ReturnDocument> => {
    const now = new Date();
    const byProduct = new Map(order.items.map((item) => [String(item.product._id), item]));
    return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        currency: order.currency,
        status: 'closed',
        reason: input.reason,
        kind: 'cancellation',
        requestedAt: opening.statement.requestedAt,
        ...(opening.statement.statedVia ? { statedVia: opening.statement.statedVia } : {}),
        openedBy: opening.staffId === undefined ? 'buyer' : 'staff',
        fulfillmentOrderId: toObjectId(fulfillmentOrderId),
        ...(input.note ? { note: input.note } : {}),
        lines: lines.map(({ productId, quantity }) => {
            // The lines come from the order's own fulfillment orders, so the product is on it.
            const item = byProduct.get(productId)!;
            return {
                productId: item.product._id,
                quantity,
                title: item.product.title,
                unitPrice: item.product.price
            };
        }),
        returnPostage: returnPostagePayer(),
        decidedAt: now,
        closedAt: now,
        refundAmount: breakdown.total,
        shippingRefund: breakdown.shipping
    };
};

/**
 * The transaction: lock the order, mark the lines, give the units back, write the Return and open
 * its refund record.
 * @param order - the order
 * @param input - the request
 * @param opening - what the buyer stated, and who recorded it when it was staff
 * @param fulfillmentOrderId - the fulfillment order whose remainder is cancelled
 * @param reason - who cancelled it, stored on the fulfillment order
 * @param context - the account that cancelled (the buyer or a staff member), for the order's timeline and the refund
 * @returns what was cancelled, or why nothing was
 */
const cancelUnderLock = (
    order: OrderDocument,
    input: CreateReturnInput,
    opening: Opener,
    fulfillmentOrderId: string,
    reason: FulfillmentCancelReason,
    context: CallerContext
): Promise<Cancelled | 'nothing-to-cancel' | 'not-found'> =>
    withTransaction(async (session) => {
        const orderId = String(order._id);
        await returnRepository.lockOrder(orderId, session);
        const earlier = await returnRepository.findByOrderId(orderId, session);

        const cancelled = await deliveryService.cancelRemainder(
            fulfillmentOrderId,
            orderId,
            session,
            reason,
            context.caller.id
        );
        if (!cancelled.ok)
            return cancelled.reason === 'not-found' ? 'not-found' : 'nothing-to-cancel';

        const breakdown = cancellationRefundOn(order, earlier, cancelled.lines);
        // A fulfillment order held for stock gives back its preorder allowance, not shelf units.
        await orderService.releaseStock(
            orderId,
            cancelled.waitingForStock
                ? cancelled.lines.map((line) => ({ ...line, kind: 'backorder' as const }))
                : cancelled.lines,
            session
        );
        const created = await returnRepository.create(
            rowFor(order, input, opening, fulfillmentOrderId, cancelled.lines, breakdown),
            session
        );
        await enqueueRequested(created, session);
        await enqueueClosed(created, session);
        const owed = created.refundAmount ?? 0;
        const opened =
            owed > 0
                ? await paymentService.openReturnRefund(
                      orderId,
                      {
                          returnId: String(created._id),
                          amount: owed,
                          lines: cancelled.lines,
                          shipping: created.shippingRefund ?? 0,
                          reason: 'cancellation'
                      },
                      context,
                      session
                  )
                : null;
        return { created, lines: cancelled.lines, opened };
    });

/**
 * Send the cancel's refund. Its record committed with the cancellation, so a refusal or any other
 * error is left to the payment sweep; nothing waits on it, the Return is closed already.
 *
 * @param order - the order
 * @param done - the cancellation just committed
 * @param context - the caller, audited on the refund
 */
const refund = (order: OrderDocument, done: Cancelled, context: CallerContext): Promise<void> =>
    done.opened
        ? paymentService
              .sendOpenedRefund(String(order._id), done.opened.refundId, context)
              .then(() => undefined)
        : Promise.resolve();

/**
 * Everything a committed cancellation unlocks: the stock cache, the refund, the audit row, the
 * order's return status. The buyer's acknowledgement mail rides `return.requested`.
 *
 * @param order - the order
 * @param done - the cancellation just committed
 * @param context - the caller
 */
const announceCancelled = (
    order: OrderDocument,
    done: Cancelled,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    nudgeOutbox();
    recordOpened(order, done.created, context);

    return inventoryService
        .refreshStockCacheForProducts(done.lines.map(({ productId }) => productId))
        .then(() => syncReturnStatus(String(order._id)))
        .then(() => refund(order, done, context))
        .then((): CreateReturnOutcome => opened(done.created));
};

/**
 * What the caller may do here, before anything is written. The rule itself is `cancelRefusalOf`;
 * this adds what only the request knows — the reason it names and what the buyer stated. The buyer
 * names `withdrawal`, their own right. Staff name any reason for their own cancel, or `withdrawal`
 * with the day and channel the buyer stated it, to record theirs. The key is asked first (403), so
 * a caller without it never learns what else is wrong.
 *
 * @param order - the order
 * @param input - the request
 * @param authContext - the caller
 * @param context - the caller, for the audit entry of a refusal
 * @param remainder - the lines of the fulfillment order being cancelled
 * @returns a refusal, or the statement to write when the caller may go on
 */
const refuseCaller = (
    order: OrderDocument,
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext,
    remainder: readonly ProductQuantity[]
): CreateReturnOutcome | Statement => {
    const buyer = isBuyer(order, authContext);
    if (buyer && input.reason !== 'withdrawal') return badCancellation();

    const keyRefusal = cancelRefusalOf(order, authContext, remainder);
    if (keyRefusal === 'no-key') return forbidden(order, 'create:Refund', context);

    const statement = checkStatement({
        byBuyer: buyer,
        reason: input.reason,
        kind: 'cancellation',
        requestedAt: input.requestedAt,
        statedVia: input.statedVia,
        orderCreatedAt: order.createdAt ?? new Date(0),
        now: new Date()
    });
    if (!statement.ok) return badStatement(statement);

    const refusal = cancelRefusalOf(
        order,
        authContext,
        remainder,
        input.reason === 'withdrawal' ? statement.requestedAt : undefined
    );
    if (refusal === 'window-closed') return windowClosed();
    if (refusal === 'excluded') return badLines('excluded');

    return statement;
};

/**
 * Cancel the remainder of one fulfillment order — `POST /returns` with `kind: cancellation`.
 *
 * @param input - the request: the order, the fulfillment order, a reason and an optional note
 * @param authContext - the buyer, or a staff member holding the refund key
 * @param context - for audit
 * @returns the outcome: refused, or the cancellation written, closed
 */
export const createCancellation = (
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    const { fulfillmentOrderId } = input;
    if (!fulfillmentOrderId || input.lines !== undefined) return Promise.resolve(badCancellation());

    // Scoped to what the caller may read: a stranger's order is a 404, not an answer that says it exists.
    return orderService.getForCaller(input.orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('returns.order-not-found')]);

        return deliveryService
            .remainderOptions(input.orderId, order.fulfillment?.shipped === true)
            .then((options) => {
                const option = options.find((one) => one.fulfillmentOrderId === fulfillmentOrderId);
                // Nothing shipped yet, or nothing left on it: the whole order is cancelled instead.
                if (!option) return nothingToCancel();

                const checked = refuseCaller(order, input, authContext, context, option.lines);
                if (!('requestedAt' in checked)) return checked;

                const byBuyer = isBuyer(order, authContext);
                const opening: Opener = {
                    statement: checked,
                    staffId: byBuyer ? undefined : authContext.id
                };
                return cancelUnderLock(
                    order,
                    input,
                    opening,
                    fulfillmentOrderId,
                    byBuyer ? FulfillmentCancelReason.buyer : FulfillmentCancelReason.staff,
                    context
                )
                    .then((done): CreateReturnOutcome | Promise<CreateReturnOutcome> =>
                        typeof done === 'string'
                            ? done === 'not-found'
                                ? badCancellation()
                                : nothingToCancel()
                            : announceCancelled(order, done, context)
                    )
                    .catch((error: unknown) => {
                        if (error instanceof ActRefusal) return error.reject;
                        throw error instanceof Error ? error : new Error(String(error));
                    });
            });
    });
};
