/**
 * @module
 * Payments — how an order's money moves, behind the provider port. One file per flow, not one
 * big file.
 *
 * Starts:    only a `pending` order's owner can start paying.
 * The gate:   the order's move to `paid`, not the charge. The provider answers first, and a
 *             slipped-away order is refunded on the spot, so money moved iff the order says `paid`.
 * Refunds:    the `order.canceled` listener, `refundPayment` and `openReturnRefund` are each made
 *             at-most-once by `addRefund`'s conditional write on `amountRefunded`.
 * Authority:  the provider's own word, arriving by webhook. The browser's is a hint that lets the
 *             happy path feel synchronous.
 *
 * @see docs/modules/payments.md#the-story
 */

import { createIntent } from './intent';
import { confirmPayment, syncPayment, receiveWebhook, applyWebhookSettlement } from './settlement';
import { refundPayment, settleRefundByHand, cancelRefund, settledRefundPayloads } from './refunds';
import { openReturnRefund, returnRefundState, sendOpenedRefund } from './return-refunds';
import { syncRefunds } from './external-refunds';
import { retryOpenRefunds, reconcileStalePayments } from './effects';
import { recordOfflinePayment } from './offline';
import { openTransferPayment } from './transfer';
import { mailPaymentReceived, mailRefundIssued, mailRefundUndeliverable } from './notify';
import { callerScope, payerScope, buyerOrderScope, readsAllPayments } from './scope';
import {
    getById,
    orderIdOf,
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
import { disputeStanding, keptInOtherCurrencyOn } from './disputes';

export { RefundLeftOpenError, WebhookProviderUnknownError } from './errors';
export type { OfflinePaymentInput } from './offline';
export type { OpenedReturnRefund } from './return-refunds';
export type { MixRow } from './stats';
export type { PaymentMethodInfo } from '../config';

/**
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
    orderIdOf,
    getForOrder,
    listForOrder,
    getRefund,
    refundOf,
    refundLegalDue,
    disputeStanding,
    keptInOtherCurrencyOn,
    refundPayment,
    openReturnRefund,
    returnRefundState,
    sendOpenedRefund,
    settleRefundByHand,
    cancelRefund,
    syncRefunds,
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
