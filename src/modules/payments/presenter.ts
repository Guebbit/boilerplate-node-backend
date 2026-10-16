/**
 * @module
 * The one place a payment document becomes the `Payment` contract. `services/view.ts`'s
 * `withActions` builds on this for the read that also needs `actions` — every write endpoint
 * (confirm, offline, refund, sync, intent) answers with this alone, `actions` being optional on
 * the wire.
 *
 * Two audiences: the payer's view (the default) and the staff view, which adds the provider's own
 * ids and a failed refund's `failureReason` — the fields the serializer always strips.
 */

import type { Payment, PaymentNextAction, Refund } from '@types';
import { bankTransferBeneficiary, bankTransferBic, bankTransferIbanFriendly } from './config';
import { displayStatusOf } from './domain';
import type { PaymentDocument, RefundRecord } from './model';

/** The stored fields only a caller holding `display:Payment` is sent. */
export interface StaffFields {
    providerRef?: string;
    refunds: Pick<RefundRecord, 'providerRefundRef' | 'failureReason'>[];
}

/**
 * The staff-only slice of a stored payment.
 * @param raw - the stored payment
 */
export const staffFieldsOf = (
    raw: Pick<PaymentDocument, 'providerRef' | 'refunds'>
): StaffFields => ({
    ...(raw.providerRef ? { providerRef: raw.providerRef } : {}),
    refunds: raw.refunds.map(({ providerRefundRef, failureReason }) => ({
        ...(providerRefundRef ? { providerRefundRef } : {}),
        ...(failureReason ? { failureReason } : {})
    }))
});

/**
 * What a payer's wire payment becomes for staff: the same, plus the provider's ids.
 * @param wire - the payment as serialized for anyone
 * @param staff - what {@link staffFieldsOf} read off the stored row
 * @returns the staff view
 */
export const withStaffFields = (wire: Payment, staff: StaffFields): Payment => ({
    ...wire,
    ...(staff.providerRef ? { providerRef: staff.providerRef } : {}),
    refunds: wire.refunds.map((refund, index): Refund => ({ ...refund, ...staff.refunds[index] }))
});

/**
 * What the buyer has to do for this payment to move, when it is waiting on them: the instructions of
 * a bank transfer that has not been sent. Beneficiary, IBAN and BIC are read live from the
 * deployment's config rather than frozen on the payment — a later change shows on every transfer
 * still open; the reference and the deadline are the payment's own. A deployment that has since
 * stopped offering transfers has nothing to show, and says nothing.
 *
 * @param document - the stored payment
 * @returns the next action, or `undefined` when the buyer has nothing to do
 */
const nextActionOf = (document: PaymentDocument): PaymentNextAction | undefined => {
    const { transferReference, payBy } = document;
    const beneficiary = bankTransferBeneficiary();
    const iban = bankTransferIbanFriendly();
    if (
        document.method !== 'bank_transfer' ||
        document.status !== 'requires_action' ||
        !transferReference ||
        !payBy ||
        !beneficiary ||
        !iban
    )
        return undefined;

    const bic = bankTransferBic();
    return {
        type: 'bank_transfer',
        beneficiary,
        iban,
        ...(bic ? { bic } : {}),
        reference: transferReference,
        payBy: payBy.toISOString()
    };
};

/**
 * The payer's view of a payment, with its `displayStatus` and what it is waiting on.
 *
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document itself
 * is typed as stored, not as the wire shape `Payment` promises — one cast narrowing what the
 * compiler cannot see through on its own.
 *
 * @param document - the stored payment
 * @param staff - when true, add the staff-only provider fields
 */
export const presentPayment = (document: PaymentDocument, staff = false): Payment => {
    const nextAction = nextActionOf(document);
    const wire = {
        ...(document.toJSON() as Omit<Payment, 'displayStatus' | 'nextAction'>),
        displayStatus: displayStatusOf(document),
        ...(nextAction ? { nextAction } : {})
    };
    return staff ? withStaffFields(wire, staffFieldsOf(document)) : wire;
};
