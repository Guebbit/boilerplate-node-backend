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
 * - the Return row is written, closed, with its refund.
 *
 * The refund follows the commit, as on receipt: its intent is the Return row, and a refund the
 * provider refuses stays open for the payment sweep.
 *
 * See: docs/modules/returns.md#cancelling-what-has-not-shipped
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import { generateReject } from '@infrastructure/http/response';
import { withTransaction } from '@infrastructure/runtime/database';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { callerForSubject } from '@kernel/permissions';
import { holdsKey } from '@kernel/ability';
import { cancelRemainder, remainderOptions, ActRefusal } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { orderService, isExcludedFromWithdrawal, returnPostagePayer } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { AuthContext, CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { RETURN_CLOSED } from '../events';
import type { ProductQuantity } from '../domain';
import { cancellationRefundOn } from './cancellation-refund';
import { mailReturnNotice } from './notify';
import { syncReturnStatus } from './projection';
import {
    badCancellation,
    badLines,
    enqueueRequested,
    nothingToCancel,
    recordOpened,
    refused,
    windowClosed,
    type CreateReturnInput,
    type CreateReturnOutcome
} from './outcome';

/** What the cancellation is made from, once the transaction has decided it. */
interface Cancelled {
    created: ReturnDocument;
    lines: ProductQuantity[];
}

/**
 * The 403 for a staff caller without the refund key: a remainder cancel is a refund with
 * consequences, so it needs the key that returns money (`payments.any.update`, `stepUp: critical`).
 */
const forbidden = (): CreateReturnOutcome =>
    refused(
        generateReject(403, [
            { code: ERROR_CODES.FORBIDDEN, message: t('generic.error-forbidden') }
        ])
    );

/**
 * The Return row of a remainder cancel, closed when made.
 * @param order - the order
 * @param input - the request
 * @param fulfillmentOrderId - the fulfillment order whose remainder was cancelled
 * @param lines - what was cancelled
 * @param breakdown - what the cancel refunds
 */
const rowFor = (
    order: OrderDocument,
    input: CreateReturnInput,
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
 * The transaction: lock the order, mark the lines, give the units back, write the Return.
 * @param order - the order
 * @param input - the request
 * @param fulfillmentOrderId - the fulfillment order whose remainder is cancelled
 * @returns what was cancelled, or why nothing was
 */
const cancelUnderLock = (
    order: OrderDocument,
    input: CreateReturnInput,
    fulfillmentOrderId: string
): Promise<Cancelled | 'nothing-to-cancel' | 'not-found'> =>
    withTransaction(async (session) => {
        const orderId = String(order._id);
        await returnRepository.lockOrder(orderId, session);
        const earlier = await returnRepository.findByOrderId(orderId, session);

        const cancelled = await cancelRemainder(fulfillmentOrderId, orderId, session);
        if (!cancelled.ok)
            return cancelled.reason === 'not-found' ? 'not-found' : 'nothing-to-cancel';

        const breakdown = cancellationRefundOn(order, earlier, cancelled.lines);
        await inventoryService.releaseLinesForOrder(orderId, cancelled.lines, session);
        const created = await returnRepository.create(
            rowFor(order, input, fulfillmentOrderId, cancelled.lines, breakdown),
            session
        );
        await enqueueRequested(created, session);
        await enqueueOutboxEvent(
            RETURN_CLOSED,
            {
                returnId: String(created._id),
                orderId,
                refundAmount: created.refundAmount ?? 0,
                currency: created.currency
            },
            orderId,
            session
        );
        return { created, lines: cancelled.lines };
    });

/**
 * Pay the cancel back. A provider refusal is logged and left: the refund is recorded as `failed`,
 * the sweep retries it, and nothing waits on it — the Return is closed already.
 *
 * @param order - the order
 * @param done - the cancellation just committed
 * @param context - the caller, audited on the refund
 */
const refund = (order: OrderDocument, done: Cancelled, context: CallerContext): Promise<void> => {
    const amount = done.created.refundAmount ?? 0;
    if (amount <= 0) return Promise.resolve();

    return paymentService
        .refundForReturn(
            String(order._id),
            {
                returnId: String(done.created._id),
                amount,
                lines: done.lines,
                shipping: done.created.shippingRefund ?? 0,
                reason: 'cancellation'
            },
            context
        )
        .then(() => undefined)
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Returns: the refund for cancellation ${String(done.created._id)} is not settled yet — the payment sweep retries it`,
                error
            });
            // Stryker restore all
        });
};

/**
 * Everything a committed cancellation unlocks: the stock cache, the refund, the audit row, the
 * order's return status and — for the buyer's own withdrawal — the acknowledgement mail.
 *
 * @param order - the order
 * @param done - the cancellation just committed
 * @param byBuyer - whether the buyer exercised their right (and is told so)
 * @param context - the caller
 */
const announceCancelled = (
    order: OrderDocument,
    done: Cancelled,
    byBuyer: boolean,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    nudgeOutbox();
    recordOpened(order, done.created, context);

    return inventoryService
        .refreshStockCacheForProducts(done.lines.map(({ productId }) => productId))
        .then(() => syncReturnStatus(String(order._id)))
        .then(() => refund(order, done, context))
        .then(() =>
            byBuyer
                ? mailReturnNotice('withdrawal-acknowledged', order, {
                      at: done.created.createdAt ?? new Date()
                  })
                : undefined
        )
        .then((): CreateReturnOutcome => ({ kind: 'created', created: done.created }));
};

/**
 * What the caller may do here, before anything is written: the buyer exercises their withdrawal
 * (within its window, never on goods Art. 16 excludes); staff need the refund key, must not be the
 * buyer and must outrank them.
 *
 * @param order - the order
 * @param input - the request
 * @param authContext - the caller
 * @param context - the caller, for the rank rule
 * @param remainder - the lines of the fulfillment order being cancelled
 * @returns a refusal, or `undefined` when the caller may go on
 */
const refuseCaller = (
    order: OrderDocument,
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext,
    remainder: readonly ProductQuantity[]
): Promise<CreateReturnOutcome | undefined> => {
    if (String(order.userId) === authContext.id) {
        if (input.reason !== 'withdrawal') return Promise.resolve(badCancellation());
        if (order.withdrawUntil && Date.now() > order.withdrawUntil.getTime())
            return Promise.resolve(windowClosed());
        const excluded = new Set(
            order.items
                .filter((item) => isExcludedFromWithdrawal(item))
                .map((item) => String(item.product._id))
        );
        return Promise.resolve(
            remainder.some(({ productId }) => excluded.has(productId))
                ? badLines('excluded')
                : undefined
        );
    }

    if (!holdsKey(callerForSubject(authContext, 'Return'), 'payments.any.update'))
        return Promise.resolve(forbidden());
    return orderService
        .ownMoneyRefusalFor(order, context)
        .then((refusal) => (refusal ? refused(refusal) : undefined));
};

/**
 * Cancel the remainder of one fulfillment order — `POST /returns` with `kind: cancellation`.
 *
 * @param input - the request: the order, the fulfillment order, a reason and an optional note
 * @param authContext - the buyer, or a staff member holding the refund key
 * @param context - for audit and the rank rule
 * @returns the outcome: refused, or the cancellation written, closed
 */
export const createCancellation = (
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    const { fulfillmentOrderId } = input;
    if (!fulfillmentOrderId || input.lines !== undefined) return Promise.resolve(badCancellation());

    return orderService.getById(input.orderId).then((order) => {
        if (!order) return refused(generateReject(404, [t('returns.order-not-found')]));

        return remainderOptions(input.orderId, order.fulfillment?.shipped === true).then(
            (options) => {
                const option = options.find((one) => one.fulfillmentOrderId === fulfillmentOrderId);
                // Nothing shipped yet, or nothing left on it: the whole order is cancelled instead.
                if (!option) return nothingToCancel();

                return refuseCaller(order, input, authContext, context, option.lines).then(
                    (refusal) => {
                        if (refusal) return refusal;

                        return cancelUnderLock(order, input, fulfillmentOrderId)
                            .then((done): CreateReturnOutcome | Promise<CreateReturnOutcome> =>
                                typeof done === 'string'
                                    ? done === 'not-found'
                                        ? badCancellation()
                                        : nothingToCancel()
                                    : announceCancelled(
                                          order,
                                          done,
                                          String(order.userId) === authContext.id,
                                          context
                                      )
                            )
                            .catch((error: unknown) => {
                                if (error instanceof ActRefusal) return refused(error.reject);
                                throw error instanceof Error ? error : new Error(String(error));
                            });
                    }
                );
            }
        );
    });
};
