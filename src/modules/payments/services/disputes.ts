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
 * @see docs/modules/payments.md#disputes
 */

import type { ClientSession } from 'mongoose';
import { padDecimal } from '@domain-primitives/money';
import { logger } from '@infrastructure/adapters/logger';
import { announceInTransaction, type OutboxAnnouncement } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { DisputeStatus } from '@types';
import { paymentRepository, type RecordedDispute } from '../repository';
import {
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED,
    PAYMENT_REFUND_OWED_AFTER_DISPUTE,
    type DisputeEventPayload
} from '../events';
import {
    bankKeptMoney,
    hasOpenDispute,
    isOpenDispute,
    otherCurrencyKept,
    refundsOwedAfterDispute,
    refundsOwedAfterWin,
    type RefundOwedAfterDispute
} from '../domain';
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
    amount: padDecimal(record.amount, record.currency),
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
                    amount: padDecimal(record.amount, record.currency),
                    currency: record.currency
                }
            },
            session
        );
};

/** The events a stored dispute report can announce. */
type DisputeEventName =
    | typeof PAYMENT_DISPUTE_OPENED
    | typeof PAYMENT_DISPUTE_UPDATED
    | typeof PAYMENT_REFUND_OWED_AFTER_DISPUTE;

/** What the write step hands the announcement: the write, and the refunds it left owed again. */
interface StoredDispute {
    recorded: RecordedDispute;
    owed: RefundOwedAfterDispute[];
}

/**
 * Whether this write turned a dispute the bank had kept money in into one it did not (a late win).
 *
 * @param recorded - what the write did
 * @param record - the report that was applied
 */
const flipsToWon = (recorded: RecordedDispute, record: DisputeRecord): boolean =>
    recorded.previous !== undefined && bankKeptMoney(recorded.previous) && !bankKeptMoney(record);

/**
 * Which refunds the stored write left owed. An ending hands back the refunds it had refused. A
 * flip from lost to won does both: the refunds staff marked returned against that dispute are owed
 * again, and the refunds still refused as `disputed` are owed as a win says, worded with
 * `followsFlip` (the to-do the loss opened is replaced by `tasks`, as for any change of outcome).
 *
 * @param payment - the payment as it stands after the write
 * @param recorded - what the write did
 * @param record - the report that was applied
 */
const owedOf = (
    payment: PaymentDocument,
    recorded: RecordedDispute,
    record: DisputeRecord
): RefundOwedAfterDispute[] =>
    flipsToWon(recorded, record) && recorded.previous
        ? [
              ...refundsOwedAfterWin(payment, recorded.previous, record, record.disputeRef),
              ...refundsOwedAfterDispute(payment).map((owed): RefundOwedAfterDispute => ({
                  ...owed,
                  followsFlip: true
              }))
          ]
        : refundsOwedAfterDispute(payment);

/**
 * The refunds this write left owed again. Only a dispute that now reads closed and did not before
 * qualifies, or a lost dispute flipped to won (the to-do the loss opened is out of date). The
 * payment is read again inside the writing transaction: the snapshot the delivery carried predates
 * this write, and a second dispute's state or a refund settled meanwhile changes the answer.
 *
 * @param payment - the payment the report names
 * @param recorded - what the write did
 * @param record - the report that was applied
 * @param session - the open transaction
 */
const owedAfter = (
    payment: PaymentDocument,
    recorded: RecordedDispute,
    record: DisputeRecord,
    session: ClientSession
): Promise<RefundOwedAfterDispute[]> =>
    timelineTypes(recorded, record).includes('dispute_closed') || flipsToWon(recorded, record)
        ? paymentRepository
              .findByOrderId(String(payment.orderId), undefined, session)
              .then((fresh) => (fresh ? [...owedOf(fresh, recorded, record)] : []))
        : Promise.resolve([]);

/**
 * The announcements a stored report earns: the dispute's own event, then one event per refund it
 * left owed again. Each is its own outbox row, so each refund's to-do dedupes on its own id.
 *
 * @param payment - the payment the report names
 * @param record - the report that was applied
 * @param stored - what the write did and left owed
 */
const announcementsOf = (
    payment: PaymentDocument,
    record: DisputeRecord,
    stored: StoredDispute
): OutboxAnnouncement<DisputeEventName>[] => [
    {
        name:
            stored.recorded.outcome === 'opened' ? PAYMENT_DISPUTE_OPENED : PAYMENT_DISPUTE_UPDATED,
        payload: payloadOf(payment, record),
        aggregateId: String(payment.orderId)
    },
    ...stored.owed.map((owed): OutboxAnnouncement<DisputeEventName> => ({
        name: PAYMENT_REFUND_OWED_AFTER_DISPUTE,
        payload: {
            paymentId: String(payment._id),
            orderId: String(payment.orderId),
            disputeId: record.disputeRef,
            ...owed
        },
        aggregateId: String(payment.orderId)
    }))
];

/**
 * Store a dispute report on its payment, its timeline rows and its events in one transaction.
 *
 * @param payment - the payment the report names
 * @param record - the report as a record
 * @returns what was done, or `null` when the report was stale or repeated
 */
const storeDispute = (
    payment: PaymentDocument,
    record: DisputeRecord
): Promise<RecordedDispute | null> =>
    announceInTransaction<StoredDispute | null, DisputeEventName>(
        (session) =>
            paymentRepository
                .recordDispute(String(payment._id), record, session)
                .then((recorded) =>
                    recorded
                        ? appendRows(String(payment.orderId), recorded, record, session)
                              .then(() => owedAfter(payment, recorded, record, session))
                              .then((owed) => ({ recorded, owed }))
                        : null
                ),
        (stored) => announcementsOf(payment, record, stored)
    ).then((stored) => stored?.recorded ?? null);

/**
 * Apply a delivery that carries a dispute: find the payment by its intent and store the report.
 * An older or repeated report matches no write and announces nothing. A report in another currency
 * than the payment's is stored like any other; only the refund arithmetic skips it (see
 * `lostToChargebacks`), and staff check its amount in the provider's dashboard.
 *
 * @param payment - the payment the delivery's intent names, already checked to be this provider's
 * @param report - the dispute as the delivery carried it
 */
export const applyDisputeDelivery = (
    payment: PaymentDocument,
    report: ProviderDisputeState
): Promise<void> =>
    storeDispute(payment, recordOf(report)).then((recorded) => {
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

/**
 * Where a payment's disputes stand, for a reader that must decide without the payment: whether any
 * dispute is still open (an inquiry included) and the payment's own currency.
 *
 * @param paymentId - the payment, read with no caller's scope
 * @returns the standing, or `undefined` for a missing payment
 */
export const disputeStanding = (
    paymentId: string
): Promise<{ open: boolean; currency: string } | undefined> =>
    paymentRepository
        .findByIdScoped(paymentId)
        .then((payment) =>
            payment ? { open: hasOpenDispute(payment), currency: payment.currency } : undefined
        );

/**
 * The currency of a dispute the bank kept money in when it is not the payment's: the app never
 * subtracted that amount from what may be refunded, so staff must check it in the provider's
 * dashboard. Read over every dispute on the payment, as the refund to-do is, so the two never
 * disagree.
 *
 * @param paymentId - the payment, read with no caller's scope
 * @returns the dispute's currency and the payment's, or `undefined` when the rule does not apply
 */
export const keptInOtherCurrencyOn = (
    paymentId: string
): Promise<{ disputeCurrency: string; paymentCurrency: string } | undefined> =>
    paymentRepository.findByIdScoped(paymentId).then((payment) => {
        const disputeCurrency = payment && otherCurrencyKept(payment, payment.currency);
        return payment && disputeCurrency
            ? { disputeCurrency, paymentCurrency: payment.currency }
            : undefined;
    });
