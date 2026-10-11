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
 * Files: `intent.ts` starts a payment. `settlement.ts` is `settlePayment` — the whole
 *        choreography, reached from the webhook AND the browser-driven paths, since two copies
 *        would drift and drifted copies commit inventory twice. `refunds.ts` is the one place
 *        money moves back out. `effects.ts` retries the stock commit (or the refund) a settlement
 *        set out to do but died before finishing. `offline.ts` records money the provider never
 *        saw and settles it through the same choreography. `view.ts` reads a payment back with
 *        its `actions`. `retention.ts` is erasure/export/the abandoned sweep. `scope.ts` decides
 *        who may see what. `lookup.ts` matches an admin-pasted RF reference back to the order it
 *        pays, the step before `recordOfflinePayment` settles it.
 *        `list.ts` is the staff Payments page's three reads: the list, the refunds, and what
 *        needs attention.
 */

import { createIntent, cancelOpenIntentForOrder } from './intent';
import {
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement
} from './settlement';
import { refundByOrder, refundForOrder, refundForReturn } from './refunds';
import { retryPendingEffects, retryOpenRefunds, reconcileStalePayments } from './effects';
import { recordOfflinePayment } from './offline';
import { getForOrder } from './view';
import {
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments
} from './retention';
import { getOrderByReference } from './lookup';
import { listPayments, listRefunds, listAttention } from './list';
import { listPaymentMethods } from '../config';

/*
 * Every operation is published by name as well as through the object below: `module.ts` wires
 * `refundForOrder` and `detachUserId` into the events that trigger them, and the suites drive the
 * operations directly. Publishing only the object would break both call sites.
 *
 * `settlePayment` and `performRefund` are NOT published: each is the choreography beneath a door
 * that carries the guards (scope, own-money rule, order gate), so a caller going round the door
 * would skip them. `confirmPayment`/`syncPayment`/`applyWebhookSettlement` and
 * `refundByOrder`/`refundForOrder`/`refundForReturn` are the doors.
 */
export { createIntent, cancelOpenIntentForOrder } from './intent';
export {
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement
} from './settlement';
export { refundByOrder, refundForOrder, refundForReturn } from './refunds';
export { retryPendingEffects, retryOpenRefunds, reconcileStalePayments } from './effects';
export { recordOfflinePayment, type OfflinePaymentInput } from './offline';
export { getForOrder, withActions } from './view';
export {
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments
} from './retention';
export { callerScope, payerScope, buyerOrderScope, readsAllPayments } from './scope';
export { getOrderByReference } from './lookup';
export { listPayments, listRefunds, listAttention } from './list';
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
    reconcileStalePayments,
    recordOfflinePayment,
    getOrderByReference,
    listPayments,
    listRefunds,
    listAttention,
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments,
    listPaymentMethods
};
