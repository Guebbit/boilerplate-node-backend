/**
 * @module
 * Payments — how an order's money moves, behind the provider port. One file per flow, not one
 * big file; see `docs/theory/layers.md`.
 *
 * Starts:    only a `pending` order's owner can start paying.
 * The gate:   the order's move to `paid`, not the charge. The provider answers first, and a
 *             slipped-away order is refunded on the spot, so money moved iff the order says `paid`.
 * Refunds:    the `order.canceled` listener, `refundPayment` and `openReturnRefund` are each made
 *             at-most-once by `addRefund`'s conditional write on `amountRefunded`.
 * Authority:  the provider's own word, arriving by webhook. The browser's is a hint that lets the
 *             happy path feel synchronous.
 *
 * Files:      one per flow, listed in docs/modules/payments.md.
 */

import { createIntent } from './intent';
import { confirmPayment, syncPayment, receiveWebhook, applyWebhookSettlement } from './settlement';
import {
    refundPayment,
    openReturnRefund,
    returnRefundState,
    sendOpenedRefund,
    settleRefundByHand,
    cancelRefund,
    settledRefundPayloads
} from './refunds';
import { retryOpenRefunds, reconcileStalePayments } from './effects';
import { recordOfflinePayment } from './offline';
import { openTransferPayment } from './transfer';
import { mailPaymentReceived, mailRefundIssued, mailRefundUndeliverable } from './notify';
import { callerScope, payerScope, buyerOrderScope, readsAllPayments } from './scope';
import {
    getById,
    getForOrder,
    listForOrder,
    getRefund,
    refundOf,
    presentWithActions,
    withActions
} from './view';
import {
    detachUserId,
    findOwnPayments,
    findOwnPaymentsForExport,
    reapAbandonedPayments
} from './retention';
import { listPayments, listRefunds, listAttention } from './list';
import { methodMix } from './stats';
import { listPaymentMethods } from '../config';
import { refundLegalDue } from './deadline';

export { RefundLeftOpenError, WebhookProviderUnknownError } from './errors';
export type { OfflinePaymentInput } from './offline';
export type { OpenedReturnRefund } from './refunds';
export type { MixRow } from './stats';
export type { PaymentMethodInfo } from '../config';

/*
 * `settlePayment`, `applyWebhookDelivery` and `performRefund` are NOT published: each is the choreography beneath a door
 * that carries the guards (scope, own-money rule, order gate), so a caller going round the door
 * would skip them. `confirmPayment`/`syncPayment`/`receiveWebhook`/`applyWebhookSettlement` and
 * `refundPayment`/`openReturnRefund`/`sendOpenedRefund` are the doors. `refundForOrder` and `cancelOpenIntentForOrder` act for the `order.canceled` listener alone, so they stay off the object too.
 */

/** The module's one service handle. Named for the record it serves, like `paymentRepository`. */
export const paymentService = {
    createIntent,
    confirmPayment,
    syncPayment,
    receiveWebhook,
    applyWebhookSettlement,
    getById,
    getForOrder,
    listForOrder,
    getRefund,
    refundOf,
    refundLegalDue,
    refundPayment,
    openReturnRefund,
    returnRefundState,
    sendOpenedRefund,
    settleRefundByHand,
    cancelRefund,
    settledRefundPayloads,
    retryOpenRefunds,
    reconcileStalePayments,
    recordOfflinePayment,
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
    mailRefundUndeliverable,
    withActions,
    presentWithActions,
    callerScope,
    payerScope,
    buyerOrderScope,
    readsAllPayments
};

export { paymentAttentionMinutes } from '../config';
