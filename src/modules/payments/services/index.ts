/**
 * @module
 * Payments — how an order's money moves, behind the provider port. One file per flow, not one
 * big file; see `docs/theory/layers.md`.
 *
 * Starts:    only a `pending` order's owner can start paying.
 * The gate:   the order's move to `paid`, not the charge. The provider answers first, and a
 *             slipped-away order is refunded on the spot, so money moved iff the order says `paid`.
 * Refunds:    the `order.cancelled` listener, `refundByOrder` and `refundForReturn` are each made
 *             at-most-once by `addRefund`'s conditional write on `amountRefunded`.
 * Authority:  the provider's own word, arriving by webhook. The browser's is a hint that lets the
 *             happy path feel synchronous.
 *
 * Files:      one per flow, listed in docs/modules/payments.md.
 */

import { createIntent, cancelOpenIntentForOrder } from './intent';
import {
    confirmPayment,
    syncPayment,
    applyWebhookDelivery,
    applyWebhookSettlement
} from './settlement';
import { refundByOrder, refundForOrder, refundForReturn } from './refunds';
import { retryOpenRefunds, reconcileStalePayments } from './effects';
import { recordOfflinePayment } from './offline';
import { openTransferPayment } from './transfer';
import { mailPaymentReceived, mailRefundIssued } from './notify';
import { callerScope, payerScope, buyerOrderScope, readsAllPayments } from './scope';
import { getForOrder, withActions } from './view';
import {
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments
} from './retention';
import { getOrderByReference } from './lookup';
import { listPayments, listRefunds, listAttention } from './list';
import { methodMix } from './stats';
import { listPaymentMethods } from '../config';

export type { OfflinePaymentInput } from './offline';
export type { MixRow } from './stats';
export type { PaymentMethodInfo } from '../config';

/*
 * `settlePayment` and `performRefund` are NOT published: each is the choreography beneath a door
 * that carries the guards (scope, own-money rule, order gate), so a caller going round the door
 * would skip them. `confirmPayment`/`syncPayment`/`applyWebhookSettlement` and
 * `refundByOrder`/`refundForOrder`/`refundForReturn` are the doors.
 */

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
    retryOpenRefunds,
    reconcileStalePayments,
    recordOfflinePayment,
    getOrderByReference,
    listPayments,
    listRefunds,
    listAttention,
    methodMix,
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments,
    listPaymentMethods,
    openTransferPayment,
    mailPaymentReceived,
    mailRefundIssued,
    withActions,
    callerScope,
    payerScope,
    buyerOrderScope,
    readsAllPayments
};
