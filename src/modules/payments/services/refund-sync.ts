/**
 * @module
 * Refunds seen from the provider's side: a refund it accepted but has not settled is re-read until
 * it ends, and a webhook naming a refund is turned into the record's next state. The provider's own
 * word, read back with `retrieveRefund`, is the only authority: a delivery's body decides nothing.
 *
 * Re-read:  the sweep asks about every record holding a provider refund id; it never resends one.
 * Webhook:  a delivery naming a refund finds the record by the stored id or by our record id the
 *           provider echoed back, so a delivery that beats `refund()`'s own answer still lands.
 * Writes:   all conditional (`./refund-settlement.ts`), so a redelivery or a race changes nothing.
 */

import { logger } from '@infrastructure/adapters/logger';
import { RefundStatus } from '@types';
import { OPEN_REFUND_STATUSES, isOpenRefund } from '../domain';
import type { ProviderRefundState } from '../providers';
import { paymentProviderRegistry } from '../providers/registry';
import type { PaymentDocument, RefundRecord } from '../model';
import { settleRefund } from './refund-settlement';

/**
 * Carry a provider's report about one refund onto its record.
 *
 * @param payment - the payment the record sits on
 * @param refund - the record, as read
 * @param state - the refund's own status at the provider
 * @param refundRef - the provider's id for it, kept on the record when it settles
 * @returns the payment after this call changed it, or `null` when nothing changed
 */
export const applyRefundState = (
    payment: PaymentDocument,
    refund: RefundRecord,
    state: ProviderRefundState,
    refundRef: string
): Promise<PaymentDocument | null> => {
    // Only an open record settles from the provider's word; a settled one needs no second call.
    if (state.status === 'succeeded' && isOpenRefund(refund))
        return settleRefund(
            payment,
            refund,
            { providerRefundRef: refundRef, from: OPEN_REFUND_STATUSES },
            undefined
        );
    return Promise.resolve(null);
};

/**
 * Ask the provider how a refund it accepted ended, and apply the answer. A provider that cannot be
 * reached is logged and left for the next sweep, so one record never holds up the others.
 *
 * @param payment - the payment the record sits on
 * @param refund - a `pending` record holding the provider's refund id
 * @returns the payment after the record settled, or `null` when it did not
 */
export const rereadRefund = (
    payment: PaymentDocument,
    refund: RefundRecord
): Promise<PaymentDocument | null> => {
    const refundRef = refund.providerRefundRef;
    const provider = paymentProviderRegistry.resolve(payment.provider);
    if (!refundRef || !provider || refund.status !== RefundStatus.pending)
        return Promise.resolve(null);

    return Promise.resolve()
        .then(() => provider.retrieveRefund(refundRef))
        .then((state) => applyRefundState(payment, refund, state, refundRef))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.warn({
                message: `Payments: could not re-read refund ${String(refund._id)} at the provider; the next sweep asks again`,
                error
            });
            // Stryker restore all
            return null;
        });
};

/**
 * Apply a webhook delivery that names a refund: find the record it is about, re-read the refund
 * from the provider, apply what it says. An unknown refund is logged and dropped: a provider reads
 * any non-2xx as a failed delivery and comes back harder, and nothing here would fix it.
 *
 * @param payment - the payment the delivery's intent names
 * @param refundRef - the refund the delivery names
 */
export const applyRefundWebhook = (payment: PaymentDocument, refundRef: string): Promise<void> => {
    const provider = paymentProviderRegistry.resolve(payment.provider);
    if (!provider) return Promise.resolve();

    return provider.retrieveRefund(refundRef).then((state) => {
        const record = payment.refunds.find(
            (refund) =>
                refund.providerRefundRef === refundRef ||
                (state.refundId !== undefined && String(refund._id) === state.refundId)
        );
        if (!record) {
            // Stryker disable all
            logger.warn({
                message: 'Payment webhook named a refund this application does not know.',
                refundRef
            });
            // Stryker restore all
            return undefined;
        }
        return applyRefundState(payment, record, state, refundRef).then(() => undefined);
    });
};
