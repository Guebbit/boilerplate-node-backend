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
import { auditForbidden } from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { callerForSubject, systemCallerContext } from '@kernel/permissions';
import { holds } from '@kernel/ability';
import { cancelRemainder, remainderOptions, waitHasExpired, ActRefusal } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { isBuyer, orderService, isExcludedFromWithdrawal } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { FulfillmentCancelReason } from '@types';
import type { AuthContext, CallerContext } from '@types';
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
import { returnPostagePayer } from '@modules/shop';

/** What the cancellation is made from, once the transaction has decided it. */
interface Cancelled {
    created: ReturnDocument;
    lines: ProductQuantity[];
}

/**
 * The 403 for a staff caller without the refund rule: a remainder cancel is a refund with
 * consequences, so it needs the rule that returns money (`create:Refund`, `stepUp: critical`).
 * Audited, since no route guard can see this refusal.
 *
 * @param order - the order the cancel was aimed at
 * @param context - the caller, for the audit entry
 */
const forbidden = (order: OrderDocument, context: CallerContext): CreateReturnOutcome => {
    auditForbidden(context, {
        targetType: 'order',
        targetId: String(order._id),
        metadata: { reason: 'missing_permission', permission: 'create:Refund' }
    });

    return refused(generateReject(403, [t('generic.error-forbidden')]));
};

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
 * @param reason - who cancelled it, stored on the fulfillment order
 * @returns what was cancelled, or why nothing was
 */
const cancelUnderLock = (
    order: OrderDocument,
    input: CreateReturnInput,
    fulfillmentOrderId: string,
    reason: FulfillmentCancelReason
): Promise<Cancelled | 'nothing-to-cancel' | 'not-found'> =>
    withTransaction(async (session) => {
        const orderId = String(order._id);
        await returnRepository.lockOrder(orderId, session);
        const earlier = await returnRepository.findByOrderId(orderId, session);

        const cancelled = await cancelRemainder(fulfillmentOrderId, orderId, session, reason);
        if (!cancelled.ok)
            return cancelled.reason === 'not-found' ? 'not-found' : 'nothing-to-cancel';

        const breakdown = cancellationRefundOn(order, earlier, cancelled.lines);
        // A fulfillment order held for stock gives back its preorder allowance, not shelf units.
        await inventoryService.releaseLinesForOrder(
            orderId,
            cancelled.waitingForStock
                ? cancelled.lines.map((line) => ({ ...line, kind: 'preorder' as const }))
                : cancelled.lines,
            session
        );
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
 * (within its window, never on goods Art. 16 excludes); anyone else needs the refund key.
 *
 * @param order - the order
 * @param input - the request
 * @param authContext - the caller
 * @param context - the caller, for the audit entry of a refusal
 * @param remainder - the lines of the fulfillment order being cancelled
 * @returns a refusal, or `undefined` when the caller may go on
 */
const refuseCaller = (
    order: OrderDocument,
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext,
    remainder: readonly ProductQuantity[]
): CreateReturnOutcome | undefined => {
    if (isBuyer(order, authContext)) {
        if (input.reason !== 'withdrawal') return badCancellation();
        if (order.withdrawUntil && Date.now() > order.withdrawUntil.getTime())
            return windowClosed();
        const excluded = new Set(
            order.items
                .filter((item) => isExcludedFromWithdrawal(item))
                .map((item) => String(item.product._id))
        );
        return remainder.some(({ productId }) => excluded.has(productId))
            ? badLines('excluded')
            : undefined;
    }

    return holds(callerForSubject(authContext, 'Return'), 'create', 'Refund')
        ? undefined
        : forbidden(order, context);
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

    return orderService.getById(input.orderId).then((order) => {
        if (!order) return refused(generateReject(404, [t('returns.order-not-found')]));

        return remainderOptions(input.orderId, order.fulfillment?.shipped === true).then(
            (options) => {
                const option = options.find((one) => one.fulfillmentOrderId === fulfillmentOrderId);
                // Nothing shipped yet, or nothing left on it: the whole order is cancelled instead.
                if (!option) return nothingToCancel();

                const refusal = refuseCaller(order, input, authContext, context, option.lines);
                if (refusal) return refusal;

                const byBuyer = isBuyer(order, authContext);
                return cancelUnderLock(
                    order,
                    input,
                    fulfillmentOrderId,
                    byBuyer ? FulfillmentCancelReason.buyer : FulfillmentCancelReason.staff
                )
                    .then((done): CreateReturnOutcome | Promise<CreateReturnOutcome> =>
                        typeof done === 'string'
                            ? done === 'not-found'
                                ? badCancellation()
                                : nothingToCancel()
                            : announceCancelled(order, done, byBuyer, context)
                    )
                    .catch((error: unknown) => {
                        if (error instanceof ActRefusal) return refused(error.reject);
                        throw error instanceof Error ? error : new Error(String(error));
                    });
            }
        );
    });
};

/**
 * The system's remainder cancel for a wait that ended in silence: what had not shipped of one
 * fulfillment order, cancelled and refunded as a `no_answer` return. The same transaction and the same
 * refund as a buyer's own cancel; the differences are who is acting (nobody at a keyboard, so no
 * rank or key to check) and that the buyer is not told twice — `delivery`'s notice was the warning.
 *
 * @param order - the order, with goods already shipped
 * @param fulfillmentOrderId - the fulfillment order whose buyer never answered
 */
const cancelRemainderUnanswered = (
    order: OrderDocument,
    fulfillmentOrderId: string
): Promise<void> => {
    const context = systemCallerContext('Return');
    return cancelUnderLock(
        order,
        {
            orderId: String(order._id),
            reason: 'no_answer',
            kind: 'cancellation',
            fulfillmentOrderId
        },
        fulfillmentOrderId,
        FulfillmentCancelReason.no_answer
    ).then((done) =>
        typeof done === 'string'
            ? undefined
            : announceCancelled(order, done, false, context).then(() => undefined)
    );
};

/**
 * End a preorder's wait that nobody answered: cancel and refund what had not shipped. `delivery`
 * announces `fulfillment_order.wait_expired` again every day until this lands, so it re-checks that
 * the wait really is still expired (a "keep waiting" that came in since wins) and that there is
 * still something to cancel.
 *
 * Which cancel depends on what has shipped:
 *
 * | The order                                         | What is cancelled                              |
 * | ------------------------------------------------- | ---------------------------------------------- |
 * | something already shipped                         | this fulfillment order's remainder, through a `no_answer` return |
 * | nothing shipped, this is the only live one        | the whole order, refunded in full              |
 * | nothing shipped, another fulfillment order lives  | nothing yet: the goods that are on the shelf   |
 * |                                                   | are the buyer's, and ship first; asked again tomorrow |
 *
 * @param orderId - the order
 * @param fulfillmentOrderId - the fulfillment order whose buyer never answered
 * @param now - the instant to judge the wait at; tests pass their own
 */
export const cancelUnanswered = (
    orderId: string,
    fulfillmentOrderId: string,
    now: Date = new Date()
): Promise<void> =>
    waitHasExpired(fulfillmentOrderId, now).then((expired) => {
        if (!expired) return undefined;

        return orderService.getById(orderId).then((order) => {
            if (!order) return undefined;
            if (order.fulfillment?.shipped === true)
                return cancelRemainderUnanswered(order, fulfillmentOrderId);

            return remainderOptions(orderId, true).then((live) =>
                live.every((option) => option.fulfillmentOrderId === fulfillmentOrderId)
                    ? orderService.cancelUnanswered(orderId).then(() => undefined)
                    : undefined
            );
        });
    });
