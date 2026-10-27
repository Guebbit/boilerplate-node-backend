/**
 * @module
 * Goods arriving: `approved → received`, the units back on sale, and the customer's money going
 * back — then `closed`. Two different facts on two different clocks, kept apart on purpose:
 *
 * - **Received** is a fact about a parcel. The status move and the restock are ONE transaction, so
 *   units are never on the shelf behind a return that reads `approved`, nor missing from it behind
 *   one that reads `received`. The move is conditional (`approved` only), which is what makes it —
 *   and so the restock — happen once however many staff click.
 * - **Closed** is a fact about money, and money cannot roll back. The refund RECORD is opened in
 *   that same transaction, carrying this return's id, so a received return always has its debt
 *   on file. Only the provider call follows the commit; if it is refused, the record stays open,
 *   the payment sweep retries it, and the `PAYMENT_REFUNDED` listener closes the return when the
 *   refund finally lands. A return is therefore never stuck `received` for a reason nobody is
 *   retrying.
 *
 * See: docs/modules/returns.md#what-the-customer-gets-back
 */

import { t } from '@infrastructure/i18n';
import {
    fieldError,
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { recordAudit } from '@infrastructure/observability/audit';
import { announceInTransaction } from '@kernel/outbox';
import { inventoryService } from '@modules/inventory';
import { cheapestStandardShipping } from '@modules/delivery';
import { ownOrderFlag } from '@modules/access';
import { buyerIdOf, orderService, sumLineItems } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { OpenedReturnRefund } from '@modules/payments';
import type { CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository, type ReturnStamp } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_RECEIVED } from '../events';
import {
    RECEIVABLE_RETURN_STATUSES,
    accountsOf,
    refundAmountFor,
    resolveRestock,
    shippingStillOwed,
    takesLastUnit,
    wireLines,
    type RefundBreakdown,
    type RestockRequest,
    type RestockVerdict
} from '../domain';
import { closeReturn } from './close';
import { syncReturnStatus } from './projection';

/** What staff may enter when the goods arrive. */
export interface ReceiveReturnInput {
    /** Handling damage kept back from the refund (Art. 14(2)), a decimal in the return's currency. */
    handlingDeduction?: number;
    /**
     * How many units of each returned product go back on sale. A product not listed goes back in
     * full; absent restocks everything. A broken unit is set to 0.
     */
    lines?: RestockRequest[];
}

/** The 409 for a return not waiting for its goods. */
const notReceivable = (): ResponseReject =>
    generateReject(409, [
        { code: ERROR_CODES.RETURN_NOT_RECEIVABLE, message: t('returns.not-receivable') }
    ]);

/** The 422 for a restock count that cannot stand, on the entry that carries it. */
const badRestock = (verdict: Extract<RestockVerdict, { ok: false }>): ResponseReject =>
    generateReject(422, [
        fieldError(
            `lines.${verdict.index}.restock`,
            t(`returns.restock-${verdict.reason}`),
            ERROR_CODES.RETURN_RESTOCK_INVALID
        )
    ]);

/** What {@link claimAndRestock} decided. */
type Claimed =
    | { kind: 'deduction-too-high' }
    | { kind: 'lost' }
    | {
          kind: 'received';
          received: ReturnDocument;
          breakdown: RefundBreakdown;
          /** The refund record opened with the receipt, or `null` when nothing is owed. */
          opened: OpenedReturnRefund | null;
      };

/**
 * The dotted `lines.<i>.restocked` writes that record, on each line, how many units went back.
 * @param restocked - per returned line, in the line's own order
 */
const stampRestocked = (restocked: readonly number[]): ReturnStamp =>
    Object.fromEntries(restocked.map((count, index) => [`lines.${index}.restocked`, count]));

/**
 * The lines that actually go back on sale: each returned line at its restock count, the ones set
 * to 0 left out.
 * @param lines - the return's lines
 * @param restocked - per returned line, in the line's own order
 */
const restockedLines = (
    lines: ReturnDocument['lines'],
    restocked: readonly number[]
): { productId: string; quantity: number }[] =>
    wireLines(lines)
        .map(({ productId }, index) => ({ productId, quantity: restocked[index] ?? 0 }))
        .filter(({ quantity }) => quantity > 0);

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
    const accounts = accountsOf(earlier, returned.currency);
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
 * the delivery — then the conditional status claim, the restock, the refund record and
 * `return.received`, in one transaction.
 * @param returned - the return
 * @param order - the order it came from
 * @param handlingDeduction - what staff keep back
 * @param restocked - per returned line, how many units go back on sale
 * @param context - the staff member receiving the goods, for the order's timeline and the refund
 * @returns what the transaction decided: a refusal of the deduction, a lost race, or the receipt
 */
const claimAndRestock = (
    returned: ReturnDocument,
    order: OrderDocument,
    handlingDeduction: number,
    restocked: readonly number[],
    context: CallerContext
): Promise<Claimed> =>
    announceInTransaction(
        async (session): Promise<Claimed> => {
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
                    ...(handlingDeduction > 0 ? { handlingDeduction } : {}),
                    ...stampRestocked(restocked)
                },
                session
            );
            if (!received) return { kind: 'lost' };

            // Only the units staff put back reach the shelf — and, in the same transaction, a
            // paid backorder. A line set to 0 writes no movement at all.
            const sellable = restockedLines(received.lines, restocked);
            if (sellable.length > 0)
                await inventoryService.restockReturnedLines(
                    sellable,
                    { reference: String(received.orderId), note: `return ${String(received._id)}` },
                    session
                );
            await orderService.appendTimeline(
                String(received.orderId),
                {
                    type: 'return_received',
                    actor: context.caller.id,
                    data: { returnId: String(received._id), refundAmount: verdict.breakdown.total }
                },
                session
            );
            // Nothing owed (a deduction ate it all, or zero-priced lines) opens no record.
            const opened =
                verdict.breakdown.total > 0
                    ? await paymentService.openReturnRefund(
                          orderId,
                          {
                              returnId: String(received._id),
                              amount: verdict.breakdown.total,
                              lines: wireLines(received.lines),
                              shipping: verdict.breakdown.shipping
                          },
                          context,
                          session
                      )
                    : null;
            return { kind: 'received', received, breakdown: verdict.breakdown, opened };
        },
        // Only a receipt is announced; a refused deduction or a lost race writes nothing.
        (claimed) =>
            claimed.kind === 'received'
                ? {
                      name: RETURN_RECEIVED,
                      payload: {
                          returnId: String(claimed.received._id),
                          orderId: String(claimed.received.orderId)
                      },
                      aggregateId: String(claimed.received.orderId)
                  }
                : []
    );

/**
 * Pay the customer back and finish the return. The refund record exists already (it committed with
 * the receipt), so a refusal or any error here only leaves it for the sweep: the return closes
 * when it lands. A hand-paid refund is only on file: the return closes when an operator confirms.
 *
 * @param received - the return, just received
 * @param opened - the refund record opened with the receipt, or `null` when nothing is owed
 * @param context - the staff member, audited on the refund
 * @returns the return as it now stands — `closed` if the money went back, else still `received`
 */
const refundAndClose = (
    received: ReturnDocument,
    opened: OpenedReturnRefund | null,
    context: CallerContext
): Promise<ReturnDocument> => {
    const finish = (): Promise<ReturnDocument> =>
        closeReturn(String(received._id), context.caller.id).then((closed) => closed ?? received);

    // No record: there is no money to wait for.
    if (!opened) return finish();

    return paymentService
        .sendOpenedRefund(String(received.orderId), opened.refundId, context)
        .then((state) => (state === 'settled' ? finish() : received));
};

/**
 * {@link receiveReturn}'s body once the return is known to be receivable: quote, claim and restock,
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
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> => {
    // Checked before anything is written: a count that cannot stand never half-receives a return.
    const restock = resolveRestock(wireLines(returned.lines), input.lines);
    if (!restock.ok) return Promise.resolve(badRestock(restock));

    return claimAndRestock(
        returned,
        order,
        input.handlingDeduction ?? 0,
        restock.restocked,
        context
    ).then((claimed) => {
        if (claimed.kind === 'deduction-too-high')
            return generateReject(422, [
                fieldError(
                    'handlingDeduction',
                    t('returns.deduction-too-high'),
                    ERROR_CODES.RETURN_DEDUCTION_INVALID
                )
            ]);
        if (claimed.kind === 'lost') return notReceivable();

        const { received, breakdown, opened } = claimed;
        const restockedTo = received.lines.map(({ productId, restocked }) => ({
            productId: String(productId),
            restocked: restocked ?? 0
        }));
        return inventoryService
            .refreshStockCacheForProducts(
                restockedTo
                    .filter(({ restocked }) => restocked > 0)
                    .map(({ productId }) => productId)
            )
            .then(() => syncReturnStatus(String(received.orderId)))
            .then(() => {
                recordAudit(context, {
                    action: returnsAuditActions.ADMIN_RETURN_RECEIVED,
                    outcome: 'success',
                    targetType: 'return',
                    targetId: id,
                    metadata: {
                        orderId: String(received.orderId),
                        refundAmount: breakdown.total,
                        restocked: restockedTo,
                        ...ownOrderFlag(context, buyerIdOf(order))
                    }
                });
                return refundAndClose(received, opened, context);
            })
            .then((after) => generateSuccess(after, 200));
    });
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

            return receiveFor(id, returned, order, input, context);
        });
    });
