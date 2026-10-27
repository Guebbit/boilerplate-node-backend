/**
 * @module
 * Disputes seen from the provider's side: a delivery carrying a dispute's own state is stored on
 * its payment and announced. The provider's word is taken from the verified body, because some
 * providers cannot be asked about a dispute; ordering is the stored `observedAt`, not arrival.
 *
 * A dispute is not a refund. It raises `payment.dispute_opened` / `payment.dispute_updated`, writes
 * a staff timeline row, and changes what a refund may do (`../domain/disputes.ts`). It never
 * touches `amountRefunded`, the order's status or a credit note.
 *
 * See: docs/modules/payments.md#disputes
 */

import type { ClientSession } from 'mongoose';
import { logger } from '@infrastructure/adapters/logger';
import { announceInTransaction } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { DisputeStatus } from '@types';
import { paymentRepository, type RecordedDispute } from '../repository';
import {
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED,
    type DisputeEventPayload
} from '../events';
import { isOpenDispute } from '../domain';
import type { DisputeRecord, PaymentDocument } from '../model';
import type { ProviderDisputeState } from '../providers';

/** Statuses where the dispute has been decided or withdrawn: `closedAt` is stamped for them. */
const CLOSED_DISPUTE_STATUSES: ReadonlySet<DisputeStatus> = new Set([
    DisputeStatus.won,
    DisputeStatus.lost,
    DisputeStatus.accepted,
    DisputeStatus.closed
]);

/**
 * The provider's report as a stored record: dates revived, `closedAt` following the status.
 * @param report - the dispute as the delivery carried it (ISO strings)
 */
const recordOf = (report: ProviderDisputeState): DisputeRecord => {
    const observedAt = new Date(report.observedAt);
    return {
        disputeRef: report.disputeRef,
        kind: report.kind,
        status: report.status,
        reason: report.reason,
        amount: report.amount,
        currency: report.currency,
        fundsWithdrawn: report.fundsWithdrawn,
        openedAt: observedAt,
        observedAt,
        ...(report.evidenceDueBy ? { evidenceDueBy: new Date(report.evidenceDueBy) } : {}),
        ...(CLOSED_DISPUTE_STATUSES.has(report.status) ? { closedAt: observedAt } : {}),
        ...(report.dashboardUrl ? { dashboardUrl: report.dashboardUrl } : {})
    };
};

/**
 * The timeline rows a write earns: `dispute_opened` for a first report, `dispute_closed` when the
 * dispute now reads closed and did not before. A late win (closed to closed) adds none.
 *
 * @param recorded - what the write did
 * @param record - the report that was applied
 */
const timelineTypes = (
    recorded: RecordedDispute,
    record: DisputeRecord
): ('dispute_opened' | 'dispute_closed')[] => {
    const wasClosed = recorded.previous ? !isOpenDispute(recorded.previous) : false;
    const nowClosed = !isOpenDispute(record);
    return [
        ...(recorded.outcome === 'opened' ? ['dispute_opened' as const] : []),
        ...(nowClosed && !wasClosed ? ['dispute_closed' as const] : [])
    ];
};

/**
 * The event payload both dispute events carry.
 * @param payment - the payment the dispute is on
 * @param record - the report that was applied
 */
const payloadOf = (payment: PaymentDocument, record: DisputeRecord): DisputeEventPayload => ({
    paymentId: String(payment._id),
    orderId: String(payment.orderId),
    disputeId: record.disputeRef,
    kind: record.kind,
    status: record.status,
    reason: record.reason,
    amount: record.amount,
    currency: record.currency,
    fundsWithdrawn: record.fundsWithdrawn,
    ...(record.evidenceDueBy ? { evidenceDueBy: record.evidenceDueBy.toISOString() } : {})
});

/**
 * Leave the timeline rows a write earns, in the write's transaction.
 *
 * @param orderId - the order the payment pays for
 * @param recorded - what the write did
 * @param record - the report that was applied
 * @param session - the open transaction
 */
const appendRows = async (
    orderId: string,
    recorded: RecordedDispute,
    record: DisputeRecord,
    session: ClientSession
): Promise<void> => {
    // One after another: a transaction's session does not take parallel operations.
    for (const type of timelineTypes(recorded, record))
        await orderService.appendTimeline(
            orderId,
            {
                type,
                data: {
                    disputeId: record.disputeRef,
                    kind: record.kind,
                    status: record.status,
                    reason: record.reason,
                    amount: record.amount,
                    currency: record.currency
                }
            },
            session
        );
};

/**
 * Store a dispute report on its payment, its timeline rows and its event in one transaction.
 *
 * @param payment - the payment the report names
 * @param record - the report as a record
 * @returns what was done, or `null` when the report was stale or repeated
 */
const storeDispute = (
    payment: PaymentDocument,
    record: DisputeRecord
): Promise<RecordedDispute | null> =>
    announceInTransaction(
        (session) =>
            paymentRepository
                .recordDispute(String(payment._id), record, session)
                .then((recorded) =>
                    recorded
                        ? appendRows(String(payment.orderId), recorded, record, session).then(
                              () => recorded
                          )
                        : recorded
                ),
        (recorded) => ({
            name: recorded.outcome === 'opened' ? PAYMENT_DISPUTE_OPENED : PAYMENT_DISPUTE_UPDATED,
            payload: payloadOf(payment, record),
            aggregateId: String(payment.orderId)
        })
    );

/**
 * Apply a delivery that carries a dispute: find the payment by its intent and store the report.
 * An older or repeated report matches no write and announces nothing; a report in another currency
 * than the payment's is dropped, since the refund arithmetic is in the payment's.
 *
 * @param payment - the payment the delivery's intent names, already checked to be this provider's
 * @param report - the dispute as the delivery carried it
 */
export const applyDisputeDelivery = (
    payment: PaymentDocument,
    report: ProviderDisputeState
): Promise<void> => {
    if (report.currency !== payment.currency) {
        // Stryker disable all
        logger.warn({
            message:
                'Payment webhook carried a dispute in another currency than its payment; dropped.',
            paymentId: String(payment._id),
            disputeId: report.disputeRef
        });
        // Stryker restore all
        return Promise.resolve();
    }
    return storeDispute(payment, recordOf(report)).then((recorded) => {
        // Stryker disable all
        logger.info({
            message: recorded
                ? 'Payment dispute applied.'
                : 'Payment dispute report was stale; ignored.',
            paymentId: String(payment._id),
            disputeId: report.disputeRef,
            status: report.status
        });
        // Stryker restore all
    });
};
