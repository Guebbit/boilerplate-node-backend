/**
 * @module
 * Refunds seen from the provider's side: a refund it accepted but has not settled is re-read until
 * it ends, and a provider's report on a refund (from a re-read, or from the webhook's listing in
 * `./external-refunds.ts`) is turned into the record's next state. The provider's own word is the
 * only authority: a delivery's body decides nothing.
 *
 * Re-read:  the sweep asks about every record holding a provider refund id; it never resends one.
 * Writes:   all conditional (`./refund-settlement.ts`), so a redelivery or a race changes nothing.
 */

import { logger } from '@infrastructure/adapters/logger';
import { RefundFailureReason, RefundStatus } from '@types';
import { OPEN_REFUND_STATUSES, isOpenRefund, isReversed } from '../domain';
import type { ProviderRefundState } from '../providers';
import { paymentProviderRegistry } from '../providers/registry';
import type { PaymentDocument, RefundRecord } from '../model';
import { reverseRefund, settleRefund } from './refund-settlement';

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
    // The provider's own failure, definite: a settled refund was taken back, an open one refused.
    // Never `canceled`: that is staff's void, closed for good.
    if (state.status === 'failed' && isOpenOrSettled(refund))
        return reverseRefund(payment, refund, state.failureReason ?? RefundFailureReason.declined);
    return Promise.resolve(null);
};

/**
 * Whether a failure report can still change this record: it settled, or it is open, and the
 * provider has not reported it failed before.
 * @param refund - the record
 */
const isOpenOrSettled = (refund: RefundRecord): boolean =>
    !isReversed(refund) && (refund.status === RefundStatus.succeeded || isOpenRefund(refund));

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
