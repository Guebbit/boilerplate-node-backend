/**
 * @module
 * Goods arriving: `approved → received`, the units back on sale, and the customer's money going
 * back — then `closed`. Two different facts on two different clocks, kept apart on purpose:
 *
 * - **Received** is a fact about a parcel. The status move and the restock are ONE transaction, so
 *   units are never on the shelf behind a return that reads `approved`, nor missing from it behind
 *   one that reads `received`. The move is conditional (`approved` only), which is what makes it —
 *   and so the restock — happen once however many staff click.
 * - **Closed** is a fact about money, and money cannot roll back. The refund is opened on the
 *   payment BEFORE the provider is asked, carrying this return's id; if the provider refuses, the
 *   refund stays open, the payment sweep retries it, and the `PAYMENT_REFUNDED` listener closes the return when the
 *   refund finally lands. A return is therefore never stuck `received` for a reason nobody is
 *   retrying.
 *
 * See: docs/modules/returns.md#what-the-customer-gets-back
 */

import { t } from '@infrastructure/i18n';
import { logger } from '@infrastructure/adapters/logger';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { withTransaction } from '@infrastructure/runtime/database';
import { recordAudit } from '@infrastructure/observability/audit';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { inventoryService } from '@modules/inventory';
import { cheapestStandardShipping } from '@modules/delivery';
import { orderService, sumLineItems } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_RECEIVED } from '../events';
import { RECEIVABLE_RETURN_STATUSES, accountsOf, takesLastUnit, wireLines } from '../domain';
import { closeReturn } from './close';
import { syncReturnStatus } from './projection';
import { refundAmountFor, shippingStillOwed, type RefundBreakdown } from './refund-amount';

/** What staff may enter when the goods arrive. */
export interface ReceiveReturnInput {
    /** Handling damage kept back from the refund (Art. 14(2)), a decimal in the return's currency. */
    handlingDeduction?: number;
}

/** The 409 for a return not waiting for its goods. */
const notReceivable = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.RETURN_NOT_RECEIVABLE, message: t('returns.not-receivable') }
    ]);

/** What {@link claimAndRestock} decided. */
type Claimed =
    | { kind: 'deduction-too-high' }
    | { kind: 'lost' }
    | { kind: 'received'; received: ReturnDocument; breakdown: RefundBreakdown };

/**
 * What this return is owed, from its frozen lines and the order's own money — given what the
 * order's other returns and cancels have already settled. Takes the delivery only if it is the one
 * that brings the order whole, and only the part not already refunded.
 *
 * @param returned - the return being received
 * @param order - the order it came from
 * @param earlier - every OTHER return on the order, as the transaction reads them
 * @param handlingDeduction - what staff keep back
 */
const quote = (
    returned: ReturnDocument,
    order: OrderDocument,
    earlier: readonly ReturnDocument[],
    handlingDeduction: number
) => {
    const accounts = accountsOf(earlier);
    const ordered = order.items.map((item) => ({
        productId: String(item.product._id),
        quantity: item.quantity
    }));
    return refundAmountFor({
        currency: returned.currency,
        reason: returned.reason,
        lines: returned.lines,
        takesLastUnit: takesLastUnit(ordered, [
            ...accounts.accountedFor,
            ...wireLines(returned.lines)
        ]),
        shippingPaid: shippingStillOwed(
            returned.currency,
            order.shippingCost ?? 0,
            accounts.shippingRefunded
        ),
        cheapestStandardShipping: cheapestStandardShipping(
            sumLineItems(order.items, order.currency).price
        ),
        handlingDeduction
    });
};

/**
 * The move that IS the receipt: under the order's lock row, quote what is owed — whether this is
 * the return that brings the order whole is decided here, so two receipts racing cannot both take
 * the delivery — then the conditional status claim, the restock and `return.received`, in one
 * transaction.
 * @param returned - the return
 * @param order - the order it came from
 * @param handlingDeduction - what staff keep back
 * @returns what the transaction decided: a refusal of the deduction, a lost race, or the receipt
 */
const claimAndRestock = (
    returned: ReturnDocument,
    order: OrderDocument,
    handlingDeduction: number
): Promise<Claimed> =>
    withTransaction(async (session): Promise<Claimed> => {
        const orderId = String(returned.orderId);
        await returnRepository.lockOrder(orderId, session);
        const everyReturn = await returnRepository.findByOrderId(orderId, session);
        const others = everyReturn.filter(({ _id }) => String(_id) !== String(returned._id));

        const verdict = quote(returned, order, others, handlingDeduction);
        if (!verdict.ok) return { kind: 'deduction-too-high' };

        const received = await returnRepository.claimStatus(
            String(returned._id),
            RECEIVABLE_RETURN_STATUSES,
            'received',
            {
                receivedAt: new Date(),
                refundAmount: verdict.breakdown.total,
                shippingRefund: verdict.breakdown.shipping,
                ...(handlingDeduction > 0 ? { handlingDeduction } : {})
            },
            session
        );
        if (!received) return { kind: 'lost' };

        await inventoryService.restockReturnedLines(
            wireLines(received.lines),
            { reference: String(received.orderId), note: `return ${String(received._id)}` },
            session
        );
        await enqueueOutboxEvent(
            RETURN_RECEIVED,
            { returnId: String(received._id), orderId: String(received.orderId) },
            String(received.orderId),
            session
        );
        return { kind: 'received', received, breakdown: verdict.breakdown };
    }).then((claimed) => {
        if (claimed.kind === 'received') nudgeOutbox();
        return claimed;
    });

/**
 * Pay the customer back and finish the return. A provider refusal is logged and left: the refund
 * is on the payment as `failed`, the sweep retries it, and the return closes when it lands.
 *
 * @param received - the return, just received
 * @param shipping - the delivery cost inside the refund, so the credit note can rate it apart
 * @param context - the staff member, audited on the refund
 * @returns the return as it now stands — `closed` if the money went back, else still `received`
 */
const refundAndClose = (
    received: ReturnDocument,
    shipping: number,
    context: CallerContext
): Promise<ReturnDocument> => {
    const owed = received.refundAmount ?? 0;
    const finish = (): Promise<ReturnDocument> =>
        closeReturn(String(received._id)).then((closed) => closed ?? received);

    // Nothing owed (a deduction ate it all, or zero-priced lines) — there is no money to wait for.
    if (owed <= 0) return finish();

    return (
        paymentService
            .refundForReturn(
                String(received.orderId),
                {
                    returnId: String(received._id),
                    amount: owed,
                    lines: received.lines.map(({ productId, quantity }) => ({
                        productId: String(productId),
                        quantity
                    })),
                    shipping
                },
                context
            )
            // `null` means there was nothing to return — no succeeded payment, or nothing left of it —
            // which is as finished as a paid-back refund: there is no money left to wait for.
            .then(() => finish())
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: `Returns: the refund for return ${String(received._id)} is not settled yet — the payment sweep retries it, and the return closes when it lands`,
                    error
                });
                // Stryker restore all
                return received;
            })
    );
};

/**
 * {@link receiveReturn}'s body once the rank rule has cleared the caller: quote, claim and restock,
 * then refund and close.
 *
 * @param id - the return
 * @param returned - the return as loaded
 * @param order - the order it belongs to
 * @param input - what staff enter on receipt
 * @param context - the staff member
 */
const receiveFor = (
    id: string,
    returned: ReturnDocument,
    order: OrderDocument,
    input: ReceiveReturnInput,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    claimAndRestock(returned, order, input.handlingDeduction ?? 0).then((claimed) => {
        if (claimed.kind === 'deduction-too-high')
            return generateReject(422, [
                {
                    code: ERROR_CODES.RETURN_DEDUCTION_INVALID,
                    message: t('returns.deduction-too-high')
                }
            ]);
        if (claimed.kind === 'lost') return notReceivable();

        const { received, breakdown } = claimed;
        return inventoryService
            .refreshStockCacheForProducts(received.lines.map(({ productId }) => String(productId)))
            .then(() => syncReturnStatus(String(received.orderId)))
            .then(() => {
                recordAudit(context, {
                    action: returnsAuditActions.ADMIN_RETURN_RECEIVED,
                    outcome: 'success',
                    targetType: 'return',
                    targetId: id,
                    metadata: {
                        orderId: String(received.orderId),
                        refundAmount: breakdown.total
                    }
                });
                return refundAndClose(received, breakdown.shipping, context);
            })
            .then((after) => generateSuccess(after, 200, t('returns.received')));
    });

/**
 * Record that a return's goods arrived: restock them, pay the customer back, close the return.
 *
 * @param id - the return
 * @param input - what staff enter on receipt
 * @param context - the staff member
 * @returns the return as it now stands, or a refusal naming which case it was
 */
export const receiveReturn = (
    id: string,
    input: ReceiveReturnInput,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    returnRepository.findById(id).then((returned) => {
        if (!returned) return generateReject(404, [t('returns.not-found')]);
        if (!RECEIVABLE_RETURN_STATUSES.includes(returned.status)) return notReceivable();

        return orderService.getById(String(returned.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('returns.order-not-found')]);

            // Nobody handles their own money: staff receive goods for a customer's return, never
            // their own, an equal's or a superior's — receiving opens the refund.
            return orderService
                .ownMoneyRefusalFor(order, context)
                .then((outranked) => outranked ?? receiveFor(id, returned, order, input, context));
        });
    });
