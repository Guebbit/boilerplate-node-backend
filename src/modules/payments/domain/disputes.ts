/**
 * @module
 * Disputes — the pure rules. A dispute is the buyer's bank asking about a card payment: an
 * `inquiry` takes no money, a `chargeback` takes it back at once and opens an evidence window.
 *
 * A chargeback is not a refund (Saleor lowers `charged`, not `refunded`): it never raises
 * `payment.refunded` and never issues a credit note. These rules only decide what the shop may
 * still do with the payment while one stands.
 *
 * @see docs/modules/payments.md#disputes
 */

import { addMoney, toMinorUnits, type Money } from '@domain-primitives/money';
import { DisputeKind, DisputeStatus } from '@types';

/** The slice of a stored dispute the rules read. */
export interface DisputeFacts {
    kind: DisputeKind;
    status: DisputeStatus;
    amount: string;
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
 */
export const isOpenDispute = (dispute: Pick<DisputeFacts, 'status'>): boolean =>
    OPEN_DISPUTE_STATUSES.includes(dispute.status);

/**
 * Whether the payment has a dispute still open, of any kind (the staff list's `disputed` filter).
 */
export const hasOpenDispute = (payment: DisputablePayment): boolean =>
    (payment.disputes ?? []).some((dispute) => isOpenDispute(dispute));

/**
 * Whether a chargeback is open: the bank has the money, so the shop cannot refund it too.
 * An open inquiry is not one: refunds stay allowed, and a full refund ends it.
 */
export const hasOpenChargeback = (payment: DisputablePayment): boolean =>
    (payment.disputes ?? []).some(
        (dispute) => dispute.kind === DisputeKind.chargeback && isOpenDispute(dispute)
    );

/**
 * Whether the bank kept the money: a chargeback decided against the shop or accepted by it. An
 * inquiry takes none, and a `won` or `closed` dispute gives nothing up.
 *
 * @param dispute - the dispute as stored
 */
export const bankKeptMoney = (dispute: Pick<DisputeFacts, 'kind' | 'status'>): boolean =>
    dispute.kind === DisputeKind.chargeback && LOSS_DISPUTE_STATUSES.has(dispute.status);

/**
 * Whether the bank kept money that was not in the payment's currency: such an amount is never
 * subtracted from what may be refunded (see {@link lostToChargebacks}), so staff must check it in
 * the provider's dashboard.
 *
 * @param dispute - the dispute as stored
 * @param currency - the payment's currency
 */
export const keptInOtherCurrency = (
    dispute: Pick<DisputeFacts, 'kind' | 'status' | 'currency'>,
    currency: string
): boolean => bankKeptMoney(dispute) && dispute.currency !== currency;

/**
 * What lost chargebacks took, in minor units: the shop cannot refund money the bank kept. A
 * `won` one took nothing (funds reinstated), so a late win gives the room back by itself. A
 * dispute reported in another currency than the payment's is not subtracted: its amount is not in
 * the payment's money, and staff check it in the provider's dashboard.
 * @param currency - the payment's currency
 */
export const lostToChargebacks = (payment: DisputablePayment, currency: string): Money =>
    addMoney(
        ...(payment.disputes ?? [])
            .filter((dispute) => bankKeptMoney(dispute) && dispute.currency === currency)
            .map((dispute) => toMinorUnits(dispute.amount, currency))
    );
