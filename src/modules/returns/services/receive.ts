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
import { emitDomainEvent } from '@kernel/events';
import { inventoryService } from '@modules/inventory';
import { cheapestStandardShipping } from '@modules/delivery';
import { orderService, orderCurrency, sumLineItems } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_RECEIVED } from '../events';
import { RECEIVABLE_RETURN_STATUSES } from '../domain';
import { closeReturn } from './close';
import { refundAmountFor, type RefundBreakdown } from './refund-amount';

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

/**
 * Whether one return carries every unit its order held — the condition for refunding delivery.
 * @param returned - the return
 * @param order - the order it came from
 */
const carriesWholeOrder = (returned: ReturnDocument, order: OrderDocument): boolean => {
    const returnedBy = new Map(
        returned.lines.map(({ productId, quantity }) => [String(productId), quantity])
    );
    return (
        order.items.length === returnedBy.size &&
        order.items.every((item) => returnedBy.get(String(item.product._id)) === item.quantity)
    );
};

/**
 * What this return is owed, from its frozen lines and the order's own money.
 * @param returned - the return being received
 * @param order - the order it came from
 * @param handlingDeduction - what staff keep back
 */
const quote = (returned: ReturnDocument, order: OrderDocument, handlingDeduction: number) =>
    refundAmountFor({
        currency: returned.currency,
        reason: returned.reason,
        lines: returned.lines,
        fullReturn: carriesWholeOrder(returned, order),
        shippingPaid: order.shippingCost ?? 0,
        cheapestStandardShipping: cheapestStandardShipping(
            sumLineItems(order.items, orderCurrency(order)).price
        ),
        handlingDeduction
    });

/**
 * The move that IS the receipt: the conditional status claim and the restock, in one transaction.
 * @param returned - the return
 * @param breakdown - what it is owed, stamped in the same write
 * @param handlingDeduction - what staff keep back
 * @returns the return as it now stands, or `null` when it was no longer `approved`
 */
const claimAndRestock = (
    returned: ReturnDocument,
    breakdown: RefundBreakdown,
    handlingDeduction: number
): Promise<ReturnDocument | null> =>
    withTransaction(async (session) => {
        const received = await returnRepository.claimStatus(
            String(returned._id),
            RECEIVABLE_RETURN_STATUSES,
            'received',
            {
                receivedAt: new Date(),
                refundAmount: breakdown.total,
                ...(handlingDeduction > 0 ? { handlingDeduction } : {})
            },
            session
        );
        if (!received) return null;

        await inventoryService.restockReturnedLines(
            received.lines.map(({ productId, quantity }) => ({
                productId: String(productId),
                quantity
            })),
            { reference: String(received.orderId), note: `return ${String(received._id)}` },
            session
        );
        return received;
    });

/**
 * Pay the customer back and finish the return. A provider refusal is logged and left: the refund
 * is on the payment as `failed`, the sweep retries it, and the return closes when it lands.
 *
 * @param received - the return, just received
 * @param context - the staff member, audited on the refund
 * @returns the return as it now stands — `closed` if the money went back, else still `received`
 */
const refundAndClose = (
    received: ReturnDocument,
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
                { returnId: String(received._id), amount: owed },
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

            const deduction = input.handlingDeduction ?? 0;
            const verdict = quote(returned, order, deduction);
            if (!verdict.ok)
                return generateReject(422, [
                    {
                        code: ERROR_CODES.RETURN_DEDUCTION_INVALID,
                        message: t('returns.deduction-too-high')
                    }
                ]);

            return claimAndRestock(returned, verdict.breakdown, deduction).then((received) => {
                if (!received) return notReceivable();

                return inventoryService
                    .refreshStockCacheForProducts(
                        received.lines.map(({ productId }) => String(productId))
                    )
                    .then(() => {
                        recordAudit(context, {
                            action: returnsAuditActions.ADMIN_RETURN_RECEIVED,
                            outcome: 'success',
                            target_type: 'return',
                            target_id: id,
                            metadata: {
                                orderId: String(received.orderId),
                                refundAmount: verdict.breakdown.total
                            }
                        });
                        void emitDomainEvent(RETURN_RECEIVED, {
                            returnId: id,
                            orderId: String(received.orderId)
                        });
                        return refundAndClose(received, context);
                    })
                    .then((after) => generateSuccess(after, 200, t('returns.received')));
            });
        });
    });
