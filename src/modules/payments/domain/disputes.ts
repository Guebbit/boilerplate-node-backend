/**
 * @module
 * Disputes — the pure rules. A dispute is the buyer's bank asking about a card payment: an
 * `inquiry` takes no money, a `chargeback` takes it back at once and opens an evidence window.
 *
 * A chargeback is not a refund (Saleor lowers `charged`, not `refunded`): it never raises
 * `payment.refunded` and never issues a credit note. These rules only decide what the shop may
 * still do with the payment while one stands.
 *
 * See: docs/modules/payments.md#disputes
 */

import { addMoney, toMinorUnits, type Money } from '@domain-primitives/money';
import { DisputeKind, DisputeStatus } from '@types';

/** The slice of a stored dispute the rules read. */
export interface DisputeFacts {
    kind: DisputeKind;
    status: DisputeStatus;
    amount: number;
    currency: string;
}

/** A payment as far as the dispute rules see it. */
export interface DisputablePayment {
    disputes?: readonly DisputeFacts[] | undefined;
}

/** Statuses where the shop or the bank still has a move to make. */
export const OPEN_DISPUTE_STATUSES: readonly DisputeStatus[] = [
    DisputeStatus.needs_response,
    DisputeStatus.under_review
];

/** Statuses that end with the bank keeping the money. */
const LOSS_DISPUTE_STATUSES: ReadonlySet<DisputeStatus> = new Set([
    DisputeStatus.lost,
    DisputeStatus.accepted
]);

/**
 * The stored-field query behind the staff list's `disputed` filter: some dispute is still open.
 * @returns a Mongo filter over payments
 */
export const openDisputeFilter = (): Record<string, unknown> => ({
    disputes: { $elemMatch: { status: { $in: [...OPEN_DISPUTE_STATUSES] } } }
});

/**
 * Whether a dispute still waits on someone.
 * @param dispute - the dispute
 */
export const isOpenDispute = (dispute: Pick<DisputeFacts, 'status'>): boolean =>
    OPEN_DISPUTE_STATUSES.includes(dispute.status);

/**
 * Whether the payment has a dispute still open, of any kind (the staff list's `disputed` filter).
 * @param payment - the payment
 */
export const hasOpenDispute = (payment: DisputablePayment): boolean =>
    (payment.disputes ?? []).some((dispute) => isOpenDispute(dispute));

/**
 * Whether a chargeback is open: the bank has the money, so the shop cannot refund it too.
 * An open inquiry is not one: refunds stay allowed, and a full refund ends it.
 * @param payment - the payment
 */
export const hasOpenChargeback = (payment: DisputablePayment): boolean =>
    (payment.disputes ?? []).some(
        (dispute) => dispute.kind === DisputeKind.chargeback && isOpenDispute(dispute)
    );

/**
 * What lost chargebacks took, in minor units: the shop cannot refund money the bank kept. A
 * `won` one took nothing (funds reinstated), so a late win gives the room back by itself.
 * @param payment - the payment
 * @param currency - the payment's currency
 */
export const lostToChargebacks = (payment: DisputablePayment, currency: string): Money =>
    addMoney(
        ...(payment.disputes ?? [])
            .filter(
                (dispute) =>
                    dispute.kind === DisputeKind.chargeback &&
                    LOSS_DISPUTE_STATUSES.has(dispute.status)
            )
            .map((dispute) => toMinorUnits(dispute.amount, currency))
    );

/**
 * Whether the lost chargebacks cover this much: the bank already paid the buyer that money, so an
 * open refund of it may be reported returned (the bank returned it).
 * @param payment - the payment
 * @param amount - the refund's amount, a decimal
 * @param currency - the payment's currency
 */
export const lostChargebackCovers = (
    payment: DisputablePayment,
    amount: number,
    currency: string
): boolean => lostToChargebacks(payment, currency) >= toMinorUnits(amount, currency);

/**
 * Whether the payment has a dispute that is decided (any), so an open refund refused as
 * `disputed` is no longer waiting on one.
 * @param payment - the payment
 */
export const hasDecidedDispute = (payment: DisputablePayment): boolean =>
    (payment.disputes ?? []).length > 0 && !hasOpenChargeback(payment);
