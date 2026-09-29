/**
 * @module
 * Payments — how an order's money moves, behind the provider port. A folder rather than one file
 * because it passed ~700 lines; see `docs/theory/layers.md`.
 *
 * Rules: only a `pending` order's owner can start paying; the order's move to `paid` is the
 *        gate, not the charge — the provider answers first, and a slipped-away order is refunded
 *        on the spot, so money moved iff the order says `paid`; a refund is the
 *        `ORDER_REFUND_OWED` listener, made at-most-once by the conditional `succeeded →
 *        refunded` move; the provider's own word, arriving by webhook, is the authority — the
 *        browser's is a hint that lets the happy path feel synchronous.
 *
 * Files: `intent.ts` starts a payment. `settlement.ts` is {@link settlePayment} — the whole
 *        choreography, reached from the webhook AND the browser-driven paths, since two copies
 *        would drift and drifted copies commit inventory twice. `refunds.ts` is the one place
 *        money moves back out. `effects.ts` retries the stock commit (or the refund) a settlement
 *        set out to do but died before finishing. `offline.ts` records money the provider never
 *        saw and settles it through the same choreography. `view.ts` reads a payment back with
 *        its `actions`. `retention.ts` is erasure/export/the abandoned sweep. `scope.ts` decides
 *        who may see what. `lookup.ts` matches an admin-pasted RF reference back to the order it
 *        pays, the step before `recordOfflinePayment` settles it.
 */

import { createIntent, cancelOpenIntentForOrder } from './intent';
import {
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement
} from './settlement';
import { refundByOrder, refundForOrder, refundForReturn } from './refunds';
import { retryPendingEffects, retryOpenRefunds } from './effects';
import { recordOfflinePayment } from './offline';
import { getForOrder } from './view';
import {
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments
} from './retention';
import { getOrderByReference } from './lookup';
import { listPaymentMethods } from '../config';

/*
 * Every operation is published by name as well as through the object below: `module.ts` wires
 * `refundForOrder` and `detachUserId` into the events that trigger them, and the suites drive the
 * operations directly. Publishing only the object would break both call sites.
 */
export { createIntent, cancelOpenIntentForOrder } from './intent';
export {
    settlePayment,
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement
} from './settlement';
export { performRefund, refundByOrder, refundForOrder, refundForReturn } from './refunds';
export { retryPendingEffects, retryOpenRefunds } from './effects';
export { recordOfflinePayment, type OfflinePaymentInput } from './offline';
export { getForOrder, withActions } from './view';
export {
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments
} from './retention';
export { callerScope } from './scope';
export { getOrderByReference } from './lookup';
export { listPaymentMethods, type PaymentMethodInfo } from '../config';

/** The module's one service handle. Named for the record it serves, like `paymentRepository`. */
export const paymentService = {
    createIntent,
    cancelOpenIntentForOrder,
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement,
    getForOrder,
    refundForOrder,
    refundByOrder,
    refundForReturn,
    retryPendingEffects,
    retryOpenRefunds,
    recordOfflinePayment,
    getOrderByReference,
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments,
    listPaymentMethods
};
