/**
 * @module
 * Rules of the billing-address correction (`PUT /orders/{id}/billing-address`): when staff may
 * still make it, and when a request changes nothing.
 *
 * @see docs/modules/orders-creation-and-exports.md#correcting-the-billing-address
 */

import type { OrderBillingAddress } from '@types';
import { ANONYMIZED_EMAIL } from './anonymization';

/**
 * Whether staff may still correct the order's billing address: not once retention erased the
 * order's personal data, since the write would put the address back after it was destroyed.
 * @param order - the order's email, the one field the scrub always overwrites
 */
export const canCorrectBilling = (order: { email: string }): boolean =>
    order.email !== ANONYMIZED_EMAIL;

/**
 * Whether a corrected address says what the order already says, field for field, the VAT number
 * and the optional phone included. A PUT that changes nothing must change nothing (RFC 9110
 * section 9.2.2: a repeat has the same effect as one), so it writes no row, announces no event
 * and burns no invoice number.
 *
 * @param current - the order's billing address now, decrypted; absent on an order with none
 * @param corrected - the address the request carries
 */
export const isSameBillingAddress = (
    current: OrderBillingAddress | undefined,
    corrected: OrderBillingAddress
): boolean =>
    // `fullName` is required, so an order with no address never matches on it.
    current?.fullName === corrected.fullName &&
    current.street === corrected.street &&
    current.city === corrected.city &&
    current.zip === corrected.zip &&
    current.country === corrected.country &&
    current.phone === corrected.phone &&
    current.vatNumber === corrected.vatNumber;
