/**
 * @module
 * The shop's to-dos: a payment, stock or delivery event opens (or touches) one task per
 * situation, and the event that ends it clears the task. The tasks engine does the writing and the
 * dedup (`taskService.openSystemTask` / `clearSystemTasks`); this file only says which event is
 * which situation, and which staff screen does the work.
 *
 * See: docs/modules/shop-tasks.md
 */

import { RefundFailureReason, TaskKind } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { fillPath, FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import type { DomainEventMap, DomainEventMeta } from '@kernel/events';
import { paymentAttentionMinutes, paymentService } from '@modules/payments';
import { shopCountry } from '@modules/shop';
import { taskService } from '@modules/tasks';
import {
    amountMismatchOpening,
    consentDueOpening,
    disputeOpening,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundRefusedOpening,
    type ShopOpening
} from '../domain/openings';

/** The statuses of a dispute that still owe the shop an answer. */
const OPEN_DISPUTE = new Set(['needs_response', 'under_review']);

/** The payments page, on the tab of what needs a person. */
const PAYMENTS_ATTENTION_WORK = `${FRONTEND_LINK_RULES.staffPages.salesPayments}?tab=attention`;

/**
 * The staff screen of an order.
 *
 * @param orderId - the order
 */
const orderWork = (orderId: string): string =>
    fillPath(FRONTEND_LINK_RULES.links.order, { id: orderId });

/**
 * When a payment situation without a legal clock is overdue: the payments page's own threshold.
 *
 * @param now - the clock
 */
const attentionDueAt = (now: Date): Date =>
    new Date(now.getTime() + paymentAttentionMinutes() * 60_000);

/**
 * Hand an opening to the tasks engine together with the screen that does its work.
 *
 * @param opening - the situation
 * @param work - the staff screen, see `SystemOpening.work` in `tasks`
 * @param meta - the event's delivery facts; its `eventId` makes a redelivery a no-op
 */
const open = (opening: ShopOpening, work: string, meta: DomainEventMeta): Promise<void> =>
    taskService.openSystemTask({ ...opening, work }, meta);

/**
 * Log a handler's failure and let the outbox redeliver: a missed open is a lost task, so the
 * error propagates after it is logged.
 *
 * @param name - the event, for the log
 * @param work - the handler's work
 */
const guarded = (name: string, work: () => Promise<void>): Promise<void> =>
    work().catch((error: unknown) => {
        logger.error({ message: `shop-tasks: could not handle ${name}`, error });
        throw error;
    });

/** The task handlers `module.ts` subscribes; each is `(payload, meta)`. */
export const shopTasks = {
    /** `payment.refund_owed_by_hand`: money to send outside the app. */
    onRefundOwedByHand: (
        payload: DomainEventMap['payment.refund_owed_by_hand'],
        meta: DomainEventMeta
    ) =>
        guarded('payment.refund_owed_by_hand', () =>
            open(
                refundOwedOpening(payload, attentionDueAt(new Date())),
                PAYMENTS_ATTENTION_WORK,
                meta
            )
        ),

    /**
     * `payment.refund_failed`: only a refusal that ends the retrying is work for a person.
     * A `disputed` one is not: the bank already returned the money, and the dispute task
     * carries that case.
     */
    onRefundFailed: (payload: DomainEventMap['payment.refund_failed'], meta: DomainEventMeta) =>
        guarded('payment.refund_failed', () =>
            payload.final && payload.failureReason !== RefundFailureReason.disputed
                ? paymentService
                      .refundDueAt(payload.paymentId, payload.refundId)
                      .then((dueAt) =>
                          open(
                              refundRefusedOpening(payload, dueAt ?? attentionDueAt(new Date())),
                              PAYMENTS_ATTENTION_WORK,
                              meta
                          )
                      )
                : Promise.resolve()
        ),

    /** `payment.refunded` and `payment.refund_canceled`: the refund no longer owes anything. */
    onRefundClosed: (payload: { refundId: string }) =>
        guarded('refund closed', () =>
            taskService.clearSystemTasks([TaskKind.manual_refund_owed, TaskKind.refund_refused], {
                type: 'refund',
                id: payload.refundId
            })
        ),

    /** `payment.amount_mismatch`: staff close it themselves once they know why. */
    onAmountMismatch: (payload: DomainEventMap['payment.amount_mismatch'], meta: DomainEventMeta) =>
        guarded('payment.amount_mismatch', () =>
            open(
                amountMismatchOpening(payload, attentionDueAt(new Date())),
                orderWork(payload.orderId),
                meta
            )
        ),

    /** `payment.dispute_opened` and `payment.dispute_updated`: open while it needs the shop. */
    onDispute: (payload: DomainEventMap['payment.dispute_opened'], meta: DomainEventMeta) =>
        guarded('payment dispute', () =>
            OPEN_DISPUTE.has(payload.status)
                ? open(
                      disputeOpening(payload, attentionDueAt(new Date())),
                      PAYMENTS_ATTENTION_WORK,
                      meta
                  )
                : taskService.clearSystemTasks([TaskKind.dispute], {
                      type: 'payment',
                      id: payload.paymentId
                  })
        ),

    /** `inventory.hold_orphaned`: paid, nothing set aside. */
    onHoldOrphaned: (payload: DomainEventMap['inventory.hold_orphaned'], meta: DomainEventMeta) =>
        guarded('inventory.hold_orphaned', () =>
            open(
                paidWithoutHoldOpening(payload.orderId, new Date()),
                orderWork(payload.orderId),
                meta
            )
        ),

    /** `order.cancelled`: nothing is owed stock for a cancelled order. */
    onOrderCancelled: (payload: { orderId: string }) =>
        guarded('order.cancelled', () =>
            taskService.clearSystemTasks([TaskKind.paid_without_hold], {
                type: 'order',
                id: payload.orderId
            })
        ),

    /** `shipment.shipped`: the goods left, so the order has stock and the delay is over. */
    onShipped: (payload: { orderId: string; fulfillmentOrderId: string }) =>
        guarded('shipment.shipped', () =>
            taskService
                .clearSystemTasks([TaskKind.paid_without_hold], {
                    type: 'order',
                    id: payload.orderId
                })
                .then(() =>
                    taskService.clearSystemTasks([TaskKind.consent_due], {
                        type: 'fulfillment_order',
                        id: payload.fulfillmentOrderId
                    })
                )
        ),

    /** `fulfillment_order.cancelled`: the buyer is out of the delay. */
    onFulfillmentOrderCancelled: (payload: { fulfillmentOrderId: string }) =>
        guarded('fulfillment_order.cancelled', () =>
            taskService.clearSystemTasks([TaskKind.consent_due], {
                type: 'fulfillment_order',
                id: payload.fulfillmentOrderId
            })
        ),

    /** The task half of `fulfillment_order.delayed`: a delay that may owe the buyer a question. */
    onDelayed: (payload: DomainEventMap['fulfillment_order.delayed'], meta: DomainEventMeta) =>
        guarded('fulfillment_order.delayed', () => {
            const opening = consentDueOpening(payload, shopCountry());
            return opening ? open(opening, orderWork(payload.orderId), meta) : Promise.resolve();
        })
};
