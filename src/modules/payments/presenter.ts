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

import type { Payment, Refund } from '@types';
import { displayStatusOf } from './domain';
import type { PaymentDocument, RefundRecord } from './model';

/** The stored fields only a caller holding `payments.any.read` is sent. */
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
 * The payer's view of a payment, with its `displayStatus`.
 *
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform: the document itself
 * is typed as stored, not as the wire shape `Payment` promises — one cast narrowing what the
 * compiler cannot see through on its own.
 *
 * @param document - the stored payment
 * @param staff - when true, add the staff-only provider fields
 */
export const presentPayment = (document: PaymentDocument, staff = false): Payment => {
    const wire = {
        ...(document.toJSON() as Omit<Payment, 'displayStatus'>),
        displayStatus: displayStatusOf(document)
    };
    return staff ? withStaffFields(wire, staffFieldsOf(document)) : wire;
};
