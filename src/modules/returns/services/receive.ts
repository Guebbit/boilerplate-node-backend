/**
 * @module
 * Goods arriving: `approved → received`, the units back on sale, and the customer's money going
 * back — then `closed`. Two different facts on two different clocks, kept apart on purpose:
 *
 * - **Received** is a fact about a parcel. The status move and the restock are ONE transaction, so
 *   units are never on the shelf behind a return that reads `approved`, nor missing from it behind
 *   one that reads `received`. The move is conditional (`approved` only), which is what makes it —
 *   and so the restock — happen once however many staff click.
 * - **Remedy** is staff's choice under the guarantee (Directive 2019/771 Art. 13): `refund` (the
 *   rest of this page), `replace` (the returned units reopen on the SAME order and ship again)
 *   or `repair` (the guarantee is extended 12 months). The last two move no money and close the
 *   return at once, in the receipt's own transaction.
 * - **Paid outside** (`paidOutside`, staff holding `create:Refund`): the buyer was already paid
 *   back in cash or by transfer. The refund record is then opened already settled by hand, in the
 *   receipt's transaction, so no provider is asked and the return closes in this step.
 * - **Closed** is a fact about money, and money cannot roll back. The refund RECORD is opened in
 *   that same transaction, carrying this return's id, so a received return always has its debt
 *   on file. Only the provider call follows the commit; if it is refused, the record stays open,
 *   the payment sweep retries it, and the `PAYMENT_REFUNDED` listener closes the return when the
 *   refund finally lands. A return is therefore never stuck `received` for a reason nobody is
 *   retrying.
 *
 * @see docs/modules/returns.md#what-the-customer-gets-back
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { NO_MONEY, padDecimal, toMinorUnits } from '@domain-primitives/money';
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
import { ActRefusal, cheapestStandardShipping, deliveryService } from '@modules/delivery';
import { ownOrderFlag } from '@modules/access';
import { buyerIdOf, orderService, sumLineItems } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { paymentService } from '@modules/payments';
import type { OpenedReturnRefund } from '@modules/payments';
import { holds } from '@kernel/ability';
import { ReturnRemedy } from '@types';
import type { CallerContext, PaidOutside } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import { returnRepository, type ReturnStamp } from '../repository';
import type { ReturnDocument } from '../model';
import { returnsAuditActions } from '../audit';
import { RETURN_RECEIVED } from '../events';
import {
    returnLifecycle,
    accountsOf,
    isGuaranteeReason,
    proofOpenedRefund,
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
import { badRemedy, forbidden } from './outcome';
import { refundDueFor } from './refund-due';

/** What staff may enter when the goods arrive. */
export interface ReceiveReturnInput {
    /** Handling damage kept back from the refund (Art. 14(2)), a decimal in the return's currency. */
    handlingDeduction?: string;
    /**
     * How many units of each returned product go back on sale. A product not listed goes back in
     * full; absent restocks everything. A broken unit is set to 0.
     */
    lines?: RestockRequest[];
    /** What the buyer is given. Absent means a refund; the others are for a defect or a wrong item. */
    remedy?: ReturnRemedy;
    /**
     * Staff already gave the money back outside the application: the refund is recorded settled by
     * hand and no provider is asked. Needs `create:Refund` as well as `receive:Return`.
     */
    paidOutside?: PaidOutside;
}

/** The 409 for a return not waiting for its goods. */
export const notReceivable = (): ResponseReject =>
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

/** What a replacement or a repair refunds: nothing. */
const NO_REFUND: RefundBreakdown = { goods: '0', shipping: '0', deduction: '0', total: '0' };

/** What {@link claimAndRestock} decided. */
type Claimed =
    | { kind: 'deduction-too-high' }
    | { kind: 'refused'; reject: ResponseReject }
    | { kind: 'lost' }
    | {
          kind: 'received';
          received: ReturnDocument;
          breakdown: RefundBreakdown;
          /** The refund record opened with the receipt, or `null` when nothing is owed or the proof opened it. */
          opened: OpenedReturnRefund | null;
          /** Whether the proof of sending opened this return's refund before the goods came. */
          openedOnProof: boolean;
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
export const quote = (
    returned: ReturnDocument,
    order: OrderDocument,
    earlier: readonly ReturnDocument[],
    handlingDeduction: string
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
            order.shippingCost ?? '0',
            accounts.shippingRefunded
        ),
        cheapestStandardShipping: cheapestStandardShipping(
            sumLineItems(order.items, order.currency).price,
            order.currency
        ),
        handlingDeduction
    });
};

/**
 * What a replacement or a repair does, in the receipt's transaction: a replacement reopens the
 * returned units on the order so they ship again through the ordinary door (the shelf top-up and
 * any owed part follow `delivery`'s lost-parcel rules); a repair pushes the guarantee out by 12
 * months, once per order. A refund does neither.
 * @param received - the return, just claimed
 * @param remedy - what the buyer is given
 * @param context - the staff member receiving the goods
 * @param session - the receipt's transaction
 * @throws {ActRefusal} when the order cannot send the units again
 */
const handOverRemedy = (
    received: ReturnDocument,
    remedy: ReturnRemedy,
    context: CallerContext,
    session: ClientSession
): Promise<unknown> => {
    if (remedy === ReturnRemedy.replace)
        return deliveryService.reopenForReplacement(
            String(received.orderId),
            wireLines(received.lines),
            session,
            context.caller.id
        );
    if (remedy === ReturnRemedy.repair)
        return orderService.extendGuarantee(String(received.orderId), session);
    return Promise.resolve();
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
 * @param remedy - what the buyer is given; anything but a refund owes no money
 * @param context - the staff member receiving the goods, for the order's timeline and the refund
 * @param paidOutside - staff already paid the buyer back outside the application: the refund
 *   record is opened settled by hand, in this transaction
 * @returns what the transaction decided: a refusal of the deduction, a lost race, or the receipt
 * @throws {ActRefusal} when a replacement cannot be sent again; the transaction aborts with it
 */
const claimAndRestock = (
    returned: ReturnDocument,
    order: OrderDocument,
    handlingDeduction: string,
    restocked: readonly number[],
    remedy: ReturnRemedy,
    context: CallerContext,
    paidOutside: PaidOutside | undefined
): Promise<Claimed> =>
    announceInTransaction(
        async (session): Promise<Claimed> => {
            const orderId = String(returned.orderId);
            await returnRepository.lockOrder(orderId, session);
            const everyReturn = await returnRepository.findByOrderId(orderId, session);
            const others = everyReturn.filter(({ _id }) => String(_id) !== String(returned._id));

            /**
             * The proof of sending opened and quoted the refund already: the goods arriving neither
             * quote it again nor open a second record.
             */
            const openedOnProof = proofOpenedRefund(returned);
            const verdict = openedOnProof
                ? {
                      ok: true as const,
                      breakdown: { ...NO_REFUND, total: returned.refundAmount ?? '0' }
                  }
                : remedy === ReturnRemedy.refund
                  ? quote(returned, order, others, handlingDeduction)
                  : { ok: true as const, breakdown: NO_REFUND };
            if (!verdict.ok) return { kind: 'deduction-too-high' };

            const receivedAt = new Date();
            const received = await returnRepository.claimStatus(
                String(returned._id),
                returnLifecycle.fromOf('receive'),
                returnLifecycle.toOf('receive'),
                {
                    receivedAt,
                    remedy,
                    ...(openedOnProof
                        ? {}
                        : {
                              refundAmount: verdict.breakdown.total,
                              shippingRefund: verdict.breakdown.shipping,
                              ...(toMinorUnits(handlingDeduction, returned.currency) > NO_MONEY
                                  ? { handlingDeduction }
                                  : {})
                          }),
                    ...stampRestocked(restocked)
                },
                session,
                /**
                 * Atomic with the claim: the guards above read `returned` before this transaction, so a
                 * proof saved since (it may open the refund) must make the claim lose, not be overwritten.
                 */
                returned.proofOfSendingAt === undefined
                    ? { proofOfSendingAt: { $exists: false } }
                    : {}
            );
            if (!received) return { kind: 'lost' };

            /**
             * Only the units staff put back reach the shelf — and, in the same transaction, a
             * paid backorder. A line set to 0 writes no movement at all.
             */
            const sellable = restockedLines(received.lines, restocked);
            if (sellable.length > 0)
                await inventoryService.restockReturnedLines(
                    sellable,
                    { reference: String(received.orderId), note: `return ${String(received._id)}` },
                    session
                );
            await handOverRemedy(received, remedy, context, session);
            await orderService.appendTimeline(
                String(received.orderId),
                {
                    type: 'return_received',
                    actor: context.caller.id,
                    data: {
                        returnId: String(received._id),
                        refundAmount: padDecimal(verdict.breakdown.total, returned.currency),
                        currency: returned.currency
                    }
                },
                session
            );
            // Nothing owed (a deduction ate it all, or zero-priced lines) opens no record.
            const due = refundDueFor(received, {
                receivedAt,
                proofOfSendingAt: received.proofOfSendingAt
            });
            const opened =
                !openedOnProof &&
                toMinorUnits(verdict.breakdown.total, returned.currency) > NO_MONEY
                    ? await paymentService.openReturnRefund(
                          orderId,
                          {
                              returnId: String(received._id),
                              amount: verdict.breakdown.total,
                              currency: received.currency,
                              lines: wireLines(received.lines),
                              shipping: verdict.breakdown.shipping,
                              ...(due ? { due } : {}),
                              ...(paidOutside ? { paidOutside } : {})
                          },
                          context,
                          session
                      )
                    : null;
            return {
                kind: 'received',
                received,
                breakdown: verdict.breakdown,
                opened,
                openedOnProof
            };
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
 * Money asked but no record opened (no succeeded payment, or nothing left on it) leaves the return
 * `received`: `payments` wrote a fact that gave staff a to-do, and the buyer is not told "refunded"
 * for money the app did not move. Staff close it by hand once they have checked.
 *
 * @param received - the return, just received
 * @param opened - the refund record opened with the receipt, or `null` when none was
 * @param owed - whether the receipt asked for money at all
 * @param context - the staff member, audited on the refund
 * @returns the return as it now stands — `closed` if the money went back, else still `received`
 */
const refundAndClose = (
    received: ReturnDocument,
    opened: OpenedReturnRefund | null,
    owed: boolean,
    context: CallerContext
): Promise<ReturnDocument> => {
    const finish = (): Promise<ReturnDocument> =>
        closeReturn(String(received._id), context.caller.id).then((closed) => closed ?? received);

    // No record and nothing asked: there is no money to wait for.
    if (!opened) return owed ? Promise.resolve(received) : finish();

    return paymentService
        .sendOpenedRefund(String(received.orderId), opened.refundId, context)
        .then((state) => (state === 'settled' ? finish() : received));
};

/**
 * Finish a return whose refund the proof of sending opened: if the money already went back, close
 * it in this step, which is what the `PAYMENT_REFUNDED` listener would have done had the goods
 * come first. While it is still owed the return stays `received` and that listener closes it.
 * A proof that asked for money and opened no record (nothing left on the payment) left a to-do for
 * staff: the return stays `received` for their hand close, as {@link refundAndClose} does.
 *
 * @param received - the return, just received
 * @param context - the staff member
 * @returns the return as it now stands: `closed` when the refund settled or none was asked for
 */
const closeAfterProofRefund = (
    received: ReturnDocument,
    context: CallerContext
): Promise<ReturnDocument> =>
    paymentService
        .returnRefundState(String(received.orderId), String(received._id))
        .then((state) =>
            state === 'open' ||
            (state === 'none' &&
                toMinorUnits(received.refundAmount ?? '0', received.currency) > NO_MONEY)
                ? received
                : closeReturn(String(received._id), context.caller.id)
                      /**
                       * `null` means the `PAYMENT_REFUNDED` listener, still delivering the proof's
                       * refund, closed it first: answer with the return as it now stands.
                       */
                      .then(
                          (closed) =>
                              closed ??
                              returnRepository
                                  .findById(String(received._id))
                                  .then((now) => now ?? received)
                      )
        );

/**
 * {@link receiveReturn}'s body once the return is known to be receivable: quote, claim and restock,
 * then refund and close.
 *
 * @param id - the return
 * @param returned - the return as loaded
 * @param order - the order it belongs to
 * @param input - what staff enter on receipt
 * @param context - the staff member
 * @param onLost - what to answer when another write (a proof of sending) took the claim first
 */
const receiveFor = (
    id: string,
    returned: ReturnDocument,
    order: OrderDocument,
    input: ReceiveReturnInput,
    context: CallerContext,
    onLost: () => Promise<ResponseSuccess<ReturnDocument> | ResponseReject>
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> => {
    const remedy = input.remedy ?? ReturnRemedy.refund;
    /**
     * Saying the buyer was already paid back is a refund: `receive:Return` alone does not carry it.
     * Checked first, so a caller without `create:Refund` learns nothing about the return's state.
     */
    if (input.paidOutside && !holds(context.caller, 'create', 'Refund'))
        return Promise.resolve(forbidden(order, 'create:Refund', context));
    // Only money goes back outside the application: a replacement or a repair moves none.
    if (input.paidOutside && remedy !== ReturnRemedy.refund)
        return Promise.resolve(badRemedy('paidOutside'));
    // Checked before anything is written: a count that cannot stand never half-receives a return.
    if (remedy !== ReturnRemedy.refund && !isGuaranteeReason(returned.reason))
        return Promise.resolve(
            generateReject(422, [
                fieldError('remedy', t('returns.remedy-invalid'), ERROR_CODES.RETURN_REMEDY_INVALID)
            ])
        );
    // The proof of sending already paid (or opened) the refund: a repair or a replacement is off the table.
    if (remedy !== ReturnRemedy.refund && proofOpenedRefund(returned))
        return Promise.resolve(
            generateReject(409, [
                {
                    code: ERROR_CODES.RETURN_REFUND_OPENED_ON_PROOF,
                    message: t('returns.remedy-after-refund-on-proof')
                }
            ])
        );
    if (
        isGuaranteeReason(returned.reason) &&
        toMinorUnits(input.handlingDeduction ?? '0', returned.currency) > NO_MONEY
    )
        // A guarantee remedy (defect, wrong item) is free of charge.
        return Promise.resolve(
            generateReject(422, [
                fieldError(
                    'handlingDeduction',
                    t('returns.deduction-on-guarantee'),
                    ERROR_CODES.RETURN_DEDUCTION_INVALID
                )
            ])
        );
    if (
        proofOpenedRefund(returned) &&
        toMinorUnits(input.handlingDeduction ?? '0', returned.currency) > NO_MONEY
    )
        // The proof of sending already opened the refund, so a deduction now has nothing to come off.
        return Promise.resolve(
            generateReject(409, [
                {
                    code: ERROR_CODES.RETURN_REFUND_OPENED_ON_PROOF,
                    message: t('returns.refund-opened-on-proof')
                }
            ])
        );
    if (input.paidOutside && proofOpenedRefund(returned))
        // The proof of sending already opened this return's refund, and it is not this request's to settle.
        return Promise.resolve(
            generateReject(409, [
                {
                    code: ERROR_CODES.RETURN_REFUND_OPENED_ON_PROOF,
                    message: t('returns.paid-outside-after-proof')
                }
            ])
        );
    const restock = resolveRestock(wireLines(returned.lines), input.lines);
    if (!restock.ok) return Promise.resolve(badRestock(restock));

    return (
        claimAndRestock(
            returned,
            order,
            input.handlingDeduction ?? '0',
            restock.restocked,
            remedy,
            context,
            input.paidOutside
        )
            // A replacement the order cannot send again aborted the receipt; the door answers it.
            .catch((error: unknown): Claimed => {
                if (error instanceof ActRefusal) return { kind: 'refused', reject: error.reject };
                throw error instanceof Error ? error : new Error(String(error));
            })
            .then((claimed) => {
                if (claimed.kind === 'lost') return onLost();
                if (claimed.kind === 'refused') return claimed.reject;
                if (claimed.kind === 'deduction-too-high')
                    return generateReject(422, [
                        fieldError(
                            'handlingDeduction',
                            t('returns.deduction-too-high'),
                            ERROR_CODES.RETURN_DEDUCTION_INVALID
                        )
                    ]);

                const { received, breakdown, opened, openedOnProof } = claimed;
                const restockedTo = received.lines.map(({ productId, restocked }) => ({
                    productId: String(productId),
                    restocked: restocked ?? 0
                }));
                // A replacement also sets units aside again, so every returned product's cache is stale.
                return inventoryService
                    .forgetAvailability(
                        restockedTo
                            .filter(
                                ({ restocked }) => restocked > 0 || remedy === ReturnRemedy.replace
                            )
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
                                remedy,
                                ...(received.preferredRemedy
                                    ? { preferredRemedy: received.preferredRemedy }
                                    : {}),
                                ...ownOrderFlag(context, buyerIdOf(order))
                            }
                        });
                        return openedOnProof
                            ? closeAfterProofRefund(received, context)
                            : refundAndClose(
                                  received,
                                  opened,
                                  toMinorUnits(breakdown.total, received.currency) > NO_MONEY,
                                  context
                              );
                    })
                    .then((after) => generateSuccess(after, 200));
            })
    );
};

/**
 * One try at the receipt: load the return, then receive it. A claim lost to a write that landed
 * after the load (a proof of sending that opened the refund) re-reads the return and redoes the
 * receipt once, against what it now holds, as the invoicing and cart-merge losers do. A second
 * loss is a real "not receivable".
 *
 * @param id - the return
 * @param input - what staff enter on receipt
 * @param context - the staff member
 * @param retried - whether this is already the second try
 */
const attemptReceipt = (
    id: string,
    input: ReceiveReturnInput,
    context: CallerContext,
    retried: boolean
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    returnRepository.findById(id).then((returned) => {
        if (!returned) return generateReject(404, [t('returns.not-found')]);
        if (!returnLifecycle.allows('receive', returned.status)) return notReceivable();

        return orderService.getById(String(returned.orderId)).then((order) => {
            if (!order) return generateReject(404, [t('returns.order-not-found')]);

            return receiveFor(id, returned, order, input, context, () =>
                retried
                    ? Promise.resolve(notReceivable())
                    : attemptReceipt(id, input, context, true)
            );
        });
    });

/**
 * Record that a return's goods arrived: restock them, pay the customer back, close the return.
 *
 * @param input - what staff enter on receipt
 * @param context - the staff member
 * @returns the return as it now stands, or a refusal naming which case it was
 */
export const receiveReturn = (
    id: string,
    input: ReceiveReturnInput,
    context: CallerContext
): Promise<ResponseSuccess<ReturnDocument> | ResponseReject> =>
    attemptReceipt(id, input, context, false);
