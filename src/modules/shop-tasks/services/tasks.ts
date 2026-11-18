/**
 * @module
 * The shop's to-dos: a payment, stock or delivery event opens (or touches) one task per
 * situation, and the event that ends it clears the task. The tasks engine does the writing and the
 * dedup (`taskService.openSystemTask` / `clearSystemTasks`); this file only says which event is
 * which situation, and which staff screen does the work.
 *
 * @see docs/modules/shop-tasks.md#the-shop-s-to-dos
 */

import { DisputeKind, DisputeStatus, RefundFailureReason, TaskKind } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { fillPath, FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import type { DomainEventMap, DomainEventMeta } from '@kernel/events';
import { paymentAttentionMinutes, paymentService, type RefundDue } from '@modules/payments';
import { shopCountry, shopTimezone } from '@modules/shop';
import { taskService } from '@modules/tasks';
import {
    amountMismatchOpening,
    consentDueOpening,
    disputeAwaitingBankOpening,
    disputeOpening,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundUnrecordedOpening,
    returnRefundShortOpening,
    refundRefusedOpening,
    refundReversedOpening,
    type LegalDeadline,
    type ShopOpening
} from '../domain/openings';
import { MINUTE_MS, dayInZone } from '@domain-primitives/time';

/** The payments page, on the tab of what needs a person. */
const PAYMENTS_ATTENTION_WORK = `${FRONTEND_LINK_RULES.staffPages.salesPayments}?tab=attention`;

/** The to-do's `work` link: the order's staff screen, filled with its id. */
const orderWork = (orderId: string): string =>
    fillPath(FRONTEND_LINK_RULES.links.order, { id: orderId });

/**
 * When a payment situation without a legal clock is overdue: the payments page's own threshold.
 *
 * @param now - the clock
 */
const attentionDueAt = (now: Date): Date =>
    new Date(now.getTime() + paymentAttentionMinutes() * MINUTE_MS);

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

/**
 * The legal deadline as a to-do states it: the rule, and the day on the shop's calendar.
 * @param due - the refund's stamped deadline, when the law sets one
 */
const legalDeadlineOf = (due: RefundDue | undefined): LegalDeadline | undefined =>
    due && { rule: due.dueRule, day: dayInZone(due.dueBy, shopTimezone()) };

/**
 * Whether an open dispute's own to-do already carries a refund the provider refused or took back
 * as `disputed`. With no dispute open there is no such to-do, so the refund needs its own.
 *
 * @param payload - the refund event
 */
const disputeTaskCarries = (payload: {
    paymentId: string;
    failureReason: RefundFailureReason;
}): Promise<boolean> =>
    payload.failureReason === RefundFailureReason.disputed
        ? paymentService
              .disputeStanding(payload.paymentId)
              .then((standing) => standing?.open === true)
        : Promise.resolve(false);

/**
 * The closing words of a dispute's to-do. A lost or accepted chargeback in another currency than
 * the payment's was never subtracted from what may be refunded, so staff must check the amount.
 *
 * @param payload - the dispute as the provider last reported it
 */
const disputeEndedNote = (payload: DomainEventMap['payment.dispute_opened']): Promise<string> => {
    const plain = `The dispute ended: ${payload.status}.`;
    const tookMoney =
        payload.kind === DisputeKind.chargeback &&
        (payload.status === DisputeStatus.lost || payload.status === DisputeStatus.accepted);
    if (!tookMoney) return Promise.resolve(plain);
    return paymentService
        .disputeStanding(payload.paymentId)
        .then((standing) =>
            standing && standing.currency !== payload.currency
                ? `${plain} It was in ${payload.currency}, not the payment's ${standing.currency}, so the app did not subtract it: check the amount in the provider's dashboard before any refund or return.`
                : plain
        );
};

/** The task handlers `module.ts` subscribes; each takes the event payload, most also its `meta`. */
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
     * A `disputed` one is left to the dispute task while a dispute is open; with none open
     * (nothing on file, or all decided) no such task exists, so the refusal opens its own.
     */
    onRefundFailed: (payload: DomainEventMap['payment.refund_failed'], meta: DomainEventMeta) =>
        guarded('payment.refund_failed', () =>
            payload.final
                ? disputeTaskCarries(payload).then((carried) =>
                      carried
                          ? undefined
                          : paymentService
                                .refundLegalDue(payload.paymentId, payload.refundId)
                                .then((due) =>
                                    open(
                                        refundRefusedOpening(
                                            payload,
                                            due?.dueBy ?? attentionDueAt(new Date()),
                                            legalDeadlineOf(due)
                                        ),
                                        PAYMENTS_ATTENTION_WORK,
                                        meta
                                    )
                                )
                  )
                : Promise.resolve()
        ),

    /**
     * `payment.refund_reversed`: a settled refund came back from the bank, so the money is owed
     * again. A `disputed` one is left to the dispute to-do while a dispute is open; with none open
     * it opens its own. The date is the legal one when the law sets one (a past date is truthful),
     * else the attention window from now, never the refund's creation.
     */
    onRefundReversed: (payload: DomainEventMap['payment.refund_reversed'], meta: DomainEventMeta) =>
        guarded('payment.refund_reversed', () =>
            disputeTaskCarries(payload).then((carried) =>
                carried
                    ? undefined
                    : paymentService
                          .refundLegalDue(payload.paymentId, payload.refundId)
                          .then((due) =>
                              open(
                                  refundReversedOpening(
                                      payload,
                                      due?.dueBy ?? attentionDueAt(new Date()),
                                      legalDeadlineOf(due)
                                  ),
                                  PAYMENTS_ATTENTION_WORK,
                                  meta
                              )
                          )
            )
        ),

    /** `payment.refunded` and `payment.refund_canceled`: the refund no longer owes anything. */
    onRefundClosed: (payload: { refundId: string }) =>
        guarded('refund closed', () =>
            taskService.clearSystemTasks(
                [TaskKind.manual_refund_owed, TaskKind.refund_refused, TaskKind.refund_reversed],
                { type: 'refund', id: payload.refundId }
            )
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

    /**
     * `payment.refund_unrecorded`: staff close it themselves, after "Re-sync refunds" or, for
     * another currency, once the refund is in their books. Nothing closes it by event: a re-sync
     * that imports the refund raises no event of its own to listen for.
     */
    onRefundUnrecorded: (
        payload: DomainEventMap['payment.refund_unrecorded'],
        meta: DomainEventMeta
    ) =>
        guarded('payment.refund_unrecorded', () =>
            open(
                refundUnrecordedOpening(payload, attentionDueAt(new Date())),
                PAYMENTS_ATTENTION_WORK,
                meta
            )
        ),

    /**
     * `payment.return_refund_short`: a return asked for more than its payment could give. Staff
     * check whether the buyer is owed the rest; a hand close of the return clears it
     * (`return.closed_by_hand`), else they close it themselves. One open to-do per return, so it
     * keeps the figures it was opened with.
     */
    onReturnRefundShort: (
        payload: DomainEventMap['payment.return_refund_short'],
        meta: DomainEventMeta
    ) =>
        guarded('payment.return_refund_short', () =>
            open(
                returnRefundShortOpening(payload, attentionDueAt(new Date())),
                fillPath(FRONTEND_LINK_RULES.staffPages.return, { id: payload.returnId }),
                meta
            )
        ),

    /** `return.closed_by_hand`: staff checked the money, so the to-do that asked for it is done. */
    onReturnClosedByHand: (payload: { returnId: string }) =>
        guarded('return.closed_by_hand', () =>
            taskService.clearSystemTasks([TaskKind.return_refund_short], {
                type: 'return',
                id: payload.returnId
            })
        ),

    /**
     * `payment.dispute_opened` and `payment.dispute_updated`: one to-do per stage. While the shop
     * owes proof there is a `dispute`; once the proof is sent the bank decides and the to-do becomes
     * a `dispute_awaiting_bank`; a decision closes whichever is open, naming the outcome.
     */
    onDispute: (payload: DomainEventMap['payment.dispute_opened'], meta: DomainEventMeta) =>
        guarded('payment dispute', () => {
            const link = { type: 'payment', id: payload.paymentId } as const;
            if (payload.status === 'needs_response')
                return open(
                    disputeOpening(payload, attentionDueAt(new Date())),
                    PAYMENTS_ATTENTION_WORK,
                    meta
                );
            if (payload.status === 'under_review')
                return taskService
                    .clearSystemTasks([TaskKind.dispute], link, 'Proof sent; the bank is deciding.')
                    .then(() =>
                        open(
                            disputeAwaitingBankOpening(payload, new Date()),
                            PAYMENTS_ATTENTION_WORK,
                            meta
                        )
                    );
            return disputeEndedNote(payload).then((note) =>
                taskService.clearSystemTasks(
                    [TaskKind.dispute, TaskKind.dispute_awaiting_bank],
                    link,
                    note
                )
            );
        }),

    /** `inventory.hold_orphaned`: paid, nothing set aside. */
    onHoldOrphaned: (payload: DomainEventMap['inventory.hold_orphaned'], meta: DomainEventMeta) =>
        guarded('inventory.hold_orphaned', () =>
            open(
                paidWithoutHoldOpening(payload.orderId, new Date()),
                orderWork(payload.orderId),
                meta
            )
        ),

    /** `order.canceled`: nothing is owed stock for a canceled order. */
    onOrderCanceled: (payload: { orderId: string }) =>
        guarded('order.canceled', () =>
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

    /** `fulfillment_order.canceled`: the buyer is out of the delay. */
    onFulfillmentOrderCanceled: (payload: { fulfillmentOrderId: string }) =>
        guarded('fulfillment_order.canceled', () =>
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
