/**
 * @module
 * Refunds made in the provider's own dashboard. A refund event lists the intent's refunds at the
 * provider and walks them: one of OURS (our record id echoed back, or its stored refund id) is
 * carried onto its record, an unknown one that succeeded is IMPORTED as a settled record, so the
 * credit note, the buyer mail and the order stamp follow like for any other refund.
 *
 * Always records:  the money really moved, so the import never refuses, even above what was paid.
 * Idempotent:      the provider's refund id is pushed only once (`importRefund`'s condition).
 * Held, not sent:  an open app record that no longer fits is left unsent (`exceedsRemaining`).
 */

import { Types, type ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { RefundStatus } from '@types';
import { announceInTransaction } from '@kernel/outbox';
import { addMoney, toDecimalAmount, toMinorUnits } from '@domain-primitives/money';
import { orderService } from '@modules/orders';
import { paymentProviderRegistry } from '../providers/registry';
import type { ProviderRefund } from '../providers';
import { paymentRepository } from '../repository';
import { PAYMENT_REFUNDED } from '../events';
import type { PaymentDocument, RefundRecord } from '../model';
import { applyRefundState } from './refund-sync';
import { refundRow, refundedPayload, stampOrder } from './refund-settlement';

/** How many times a lost race on the running total is re-read before the delivery is left to retry. */
const MAX_IMPORT_ATTEMPTS = 3;

/**
 * The record a provider refund is, when it is ours: the stored refund id, or our record id the
 * provider echoed from its metadata.
 *
 * @param payment - the payment
 * @param providerRefund - the provider's refund
 */
const ourRecord = (
    payment: PaymentDocument,
    providerRefund: ProviderRefund
): RefundRecord | undefined =>
    payment.refunds.find(
        (record) =>
            record.providerRefundRef === providerRefund.refundRef ||
            (providerRefund.refundId !== undefined &&
                String(record._id) === providerRefund.refundId)
    );

/**
 * The settled record an outside refund becomes.
 *
 * @param providerRefund - the provider's refund
 */
const importedRecord = (providerRefund: ProviderRefund): RefundRecord => ({
    _id: new Types.ObjectId(),
    amount: providerRefund.amount,
    currency: providerRefund.currency,
    status: RefundStatus.succeeded,
    reason: 'external',
    idempotencyKey: `import:${providerRefund.refundRef}`,
    providerRefundRef: providerRefund.refundRef,
    createdAt: providerRefund.createdAt,
    settledAt: providerRefund.createdAt
});

/**
 * The import's writes in one transaction: the record and the running total (conditional), the order's
 * two timeline rows, and the order stamp.
 *
 * @param payment - the payment as read
 * @param record - the record to append
 * @param session - the transaction
 */
const writeImport = (
    payment: PaymentDocument,
    record: RefundRecord,
    session: ClientSession
): Promise<PaymentDocument | null> =>
    paymentRepository
        .importRefund(
            String(payment._id),
            payment.amountRefunded,
            toDecimalAmount(
                addMoney(
                    toMinorUnits(payment.amountRefunded, payment.currency),
                    toMinorUnits(record.amount, payment.currency)
                ),
                payment.currency
            ),
            record,
            session
        )
        .then((final) =>
            final
                ? stampOrder(final, session)
                      .then(() =>
                          orderService.appendTimeline(
                              String(final.orderId),
                              { type: 'refund_issued', actor: null, data: refundRow(record) },
                              session
                          )
                      )
                      .then(() =>
                          orderService.appendTimeline(
                              String(final.orderId),
                              { type: 'refund_settled', actor: null, data: refundRow(record) },
                              session
                          )
                      )
                      .then(() => final)
                : null
        );

/**
 * Import one outside refund, re-reading the payment when a racing write moved the running total.
 *
 * @param payment - the payment as the caller read it
 * @param providerRefund - the succeeded refund no record of ours matches
 * @param attemptsLeft - how many more re-reads a lost race may take
 */
const importRefund = (
    payment: PaymentDocument,
    providerRefund: ProviderRefund,
    attemptsLeft = MAX_IMPORT_ATTEMPTS
): Promise<PaymentDocument> => {
    const record = importedRecord(providerRefund);
    return announceInTransaction(
        (session) => writeImport(payment, record, session),
        (final) => ({
            name: PAYMENT_REFUNDED,
            payload: refundedPayload(final, record),
            aggregateId: String(final.orderId)
        })
    ).then((final) => {
        if (final) {
            // Stryker disable next-line all
            logger.warn({
                message: 'A refund made outside the application was imported.',
                refundRef: providerRefund.refundRef,
                orderId: String(payment.orderId)
            });
            return final;
        }
        // A miss is a duplicate delivery (already imported) or a moved total: read again.
        return paymentRepository.findById(String(payment._id)).then((fresh) => {
            if (!fresh) return payment;
            const done = fresh.refunds.some(
                (existing) => existing.providerRefundRef === providerRefund.refundRef
            );
            return done || attemptsLeft <= 0
                ? fresh
                : importRefund(fresh, providerRefund, attemptsLeft - 1);
        });
    });
};

/**
 * Whether an outside refund can be imported: it succeeded, and it is in the payment's own currency
 * (another currency is logged and skipped, never converted).
 *
 * @param payment - the payment
 * @param providerRefund - the provider's refund
 */
const isImportable = (payment: PaymentDocument, providerRefund: ProviderRefund): boolean => {
    if (providerRefund.status !== 'succeeded') return false;
    if (providerRefund.currency === payment.currency) return true;
    // Stryker disable all
    logger.error({
        message: 'A refund made outside the application is in another currency; not imported.',
        refundRef: providerRefund.refundRef,
        orderId: String(payment.orderId)
    });
    // Stryker restore all
    return false;
};

/**
 * Walk the provider's refunds for one payment: carry each of ours onto its record, import each
 * outside one that succeeded. A pending or failed outside refund is skipped; a later event that
 * says it succeeded imports it. Sequential, each step on the payment the previous one left.
 *
 * @param payment - a `succeeded` payment holding a provider intent
 * @returns once every refund has been looked at
 */
export const syncProviderRefunds = (payment: PaymentDocument): Promise<void> => {
    const provider = paymentProviderRegistry.resolve(payment.provider);
    const { providerRef } = payment;
    if (!provider || !providerRef) return Promise.resolve();

    return provider.listRefunds(providerRef).then(async (providerRefunds) => {
        let current = payment;
        // Sequential on purpose: each step is conditional on the running total the last one left.
        for (const providerRefund of providerRefunds)
            current = await syncOne(current, providerRefund);
    });
};

/**
 * One provider refund: ours or an outside one.
 *
 * @param payment - the payment as the previous step left it
 * @param providerRefund - the provider's refund
 * @returns the payment after this step
 */
const syncOne = (
    payment: PaymentDocument,
    providerRefund: ProviderRefund
): Promise<PaymentDocument> => {
    const record = ourRecord(payment, providerRefund);
    if (record)
        return applyRefundState(payment, record, providerRefund, providerRefund.refundRef).then(
            (after) => after ?? payment
        );
    return isImportable(payment, providerRefund)
        ? importRefund(payment, providerRefund)
        : Promise.resolve(payment);
};
