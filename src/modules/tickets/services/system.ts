/**
 * @module
 * Tickets the system opens and closes. A producer's event opens (or touches) one ticket per
 * situation; the event that ends the situation closes it as `cleared`. Both halves are idempotent:
 * a redelivered event (same `eventId`) changes nothing, two racing events open one ticket (the
 * unique `openKey`), and a clearing event on a ticket staff already closed is a no-op.
 *
 * See: docs/modules/tickets.md
 */

import { TicketKind } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit } from '@infrastructure/observability/audit';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import type { DomainEventMap, DomainEventMeta } from '@kernel/events';
import { systemCallerContext } from '@kernel/permissions';
import { paymentAttentionMinutes, paymentService } from '@modules/payments';
import { ticketsAuditActions } from '../audit';
import { ticketsConfig } from '../config';
import {
    accountReviewOpening,
    amountMismatchOpening,
    clear,
    consentDueOpening,
    disputeOpening,
    exportFailedOpening,
    openKeyOf,
    paidWithoutHoldOpening,
    refundOwedOpening,
    refundRefusedOpening,
    routeSetOf,
    type SystemOpening
} from '../domain';
import { TICKET_OPENED } from '../events';
import { ticketRepository } from '../repository';

/** The statuses of a dispute that still owe the shop an answer. */
const OPEN_DISPUTE = new Set(['needs_response', 'under_review']);

/**
 * When a payment situation without a legal clock is overdue: the payments page's own threshold.
 *
 * @param now - the clock
 */
const attentionDueAt = (now: Date): Date =>
    new Date(now.getTime() + paymentAttentionMinutes() * 60_000);

/**
 * Open one ticket for a situation, or stamp the open one seen again. Announces `ticket.opened`
 * only on an insert: a repeat tells nobody twice.
 *
 * @param opening - the situation
 * @param meta - the event's delivery facts; its `eventId` makes a redelivery a no-op
 */
export const openSystemTicket = (opening: SystemOpening, meta: DomainEventMeta): Promise<void> => {
    const openKey = openKeyOf(opening.kind, opening.link);
    const now = new Date();
    const touch = () =>
        ticketRepository.touchOpen(openKey, meta.eventId, now).then(() => undefined);

    const open = () =>
        ticketRepository
            .insertSystem({
                kind: opening.kind,
                routeSet: routeSetOf(opening.kind),
                link: opening.link,
                openKey,
                ...(opening.subjectId ? { subjectId: opening.subjectId } : {}),
                subject: opening.subject,
                message: opening.message,
                dueAt: opening.dueAt,
                eventId: meta.eventId,
                now
            })
            .then((created) => {
                recordAudit(systemCallerContext('Ticket'), {
                    action: ticketsAuditActions.SYSTEM_TICKET_OPENED,
                    outcome: 'success',
                    targetType: 'ticket',
                    targetId: String(created._id),
                    metadata: { kind: created.kind }
                });
                return emitDomainEvent(TICKET_OPENED, {
                    tenantId: DEPLOYMENT_TENANT_ID,
                    ticketId: String(created._id),
                    kind: created.kind,
                    routeSet: created.routeSet
                }).then(() => undefined);
            })
            // Another event opened it first: this one only touches.
            .catch((error: unknown) => {
                if (!isDuplicateKey(error)) throw error;
                return touch();
            });

    const seen = meta.eventId ? ticketRepository.sawEvent(meta.eventId) : Promise.resolve(false);
    return seen.then((replayed) => (replayed ? undefined : open()));
};

/**
 * Close the open system tickets a filter matches, as `cleared`. Each close is one conditional
 * write on the status read, so staff closing at the same moment wins and this one steps aside.
 *
 * @param filter - which open tickets the ending situation closes
 */
const clearMatching = (filter: Record<string, unknown>): Promise<void> => {
    const now = new Date();
    return ticketRepository
        .findOpenSystem(filter)
        .then((open) =>
            Promise.all(
                open.map((ticket) =>
                    ticketRepository
                        .moveFrom(String(ticket._id), ticket.status, clear(now))
                        .then((moved) => {
                            if (moved)
                                recordAudit(systemCallerContext('Ticket'), {
                                    action: ticketsAuditActions.SYSTEM_TICKET_CLEARED,
                                    outcome: 'success',
                                    targetType: 'ticket',
                                    targetId: String(moved._id),
                                    metadata: { kind: moved.kind }
                                });
                        })
                )
            )
        )
        .then(() => undefined);
};

/**
 * Close the open ticket of one kind and record.
 *
 * @param kinds - the kinds the ending situation can have opened
 * @param link - the record
 * @param link.type - the record's type
 * @param link.id - the record's id
 */
const clearRecord = (
    kinds: readonly TicketKind[],
    link: { type: SystemOpening['link']['type']; id: string }
): Promise<void> => clearMatching({ openKey: { $in: kinds.map((kind) => openKeyOf(kind, link)) } });

/**
 * Log a handler's failure and let the outbox redeliver: a missed open is a lost ticket, so the
 * error propagates after it is logged.
 *
 * @param name - the event, for the log
 * @param work - the handler's work
 */
const guarded = (name: string, work: () => Promise<void>): Promise<void> =>
    work().catch((error: unknown) => {
        logger.error({ message: `tickets: could not handle ${name}`, error });
        throw error;
    });

/** The event handlers `module.ts` subscribes; each is `(payload, meta)`. */
export const systemTickets = {
    /** `user.review_flagged`: an account to look at. */
    onReviewFlagged: (payload: DomainEventMap['user.review_flagged'], meta: DomainEventMeta) =>
        guarded('user.review_flagged', () =>
            openSystemTicket(accountReviewOpening(payload.userId, new Date()), meta)
        ),

    /** `user.review_cleared`: staff acted on the flag. */
    onReviewCleared: (payload: DomainEventMap['user.review_cleared']) =>
        guarded('user.review_cleared', () =>
            clearRecord([TicketKind.account_review], { type: 'user', id: payload.userId })
        ),

    /** `payment.refund_owed_by_hand`: money to send outside the app. */
    onRefundOwedByHand: (
        payload: DomainEventMap['payment.refund_owed_by_hand'],
        meta: DomainEventMeta
    ) =>
        guarded('payment.refund_owed_by_hand', () =>
            openSystemTicket(refundOwedOpening(payload, attentionDueAt(new Date())), meta)
        ),

    /** `payment.refund_failed`: only a refusal that ends the retrying is work for a person. */
    onRefundFailed: (payload: DomainEventMap['payment.refund_failed'], meta: DomainEventMeta) =>
        guarded('payment.refund_failed', () =>
            payload.final
                ? paymentService
                      .refundDueAt(payload.paymentId, payload.refundId)
                      .then((dueAt) =>
                          openSystemTicket(
                              refundRefusedOpening(payload, dueAt ?? attentionDueAt(new Date())),
                              meta
                          )
                      )
                : Promise.resolve()
        ),

    /** `payment.refunded` and `payment.refund_canceled`: the refund no longer owes anything. */
    onRefundClosed: (payload: { refundId: string }) =>
        guarded('refund closed', () =>
            clearRecord([TicketKind.manual_refund_owed, TicketKind.refund_refused], {
                type: 'refund',
                id: payload.refundId
            })
        ),

    /** `payment.amount_mismatch`: staff close it themselves once they know why. */
    onAmountMismatch: (payload: DomainEventMap['payment.amount_mismatch'], meta: DomainEventMeta) =>
        guarded('payment.amount_mismatch', () =>
            openSystemTicket(amountMismatchOpening(payload, attentionDueAt(new Date())), meta)
        ),

    /** `payment.dispute_opened` and `payment.dispute_updated`: open while it needs the shop. */
    onDispute: (payload: DomainEventMap['payment.dispute_opened'], meta: DomainEventMeta) =>
        guarded('payment dispute', () =>
            OPEN_DISPUTE.has(payload.status)
                ? openSystemTicket(disputeOpening(payload, attentionDueAt(new Date())), meta)
                : clearRecord([TicketKind.dispute], { type: 'payment', id: payload.paymentId })
        ),

    /** `inventory.hold_orphaned`: paid, nothing set aside. */
    onHoldOrphaned: (payload: DomainEventMap['inventory.hold_orphaned'], meta: DomainEventMeta) =>
        guarded('inventory.hold_orphaned', () =>
            openSystemTicket(paidWithoutHoldOpening(payload.orderId, new Date()), meta)
        ),

    /** `order.cancelled`: nothing is owed stock for a cancelled order. */
    onOrderCancelled: (payload: { orderId: string }) =>
        guarded('order.cancelled', () =>
            clearRecord([TicketKind.paid_without_hold], { type: 'order', id: payload.orderId })
        ),

    /** `shipment.shipped`: the goods left, so the order has stock and the delay is over. */
    onShipped: (payload: { orderId: string; fulfillmentOrderId: string }) =>
        guarded('shipment.shipped', () =>
            clearRecord([TicketKind.paid_without_hold], {
                type: 'order',
                id: payload.orderId
            }).then(() =>
                clearRecord([TicketKind.consent_due], {
                    type: 'fulfillment_order',
                    id: payload.fulfillmentOrderId
                })
            )
        ),

    /** `fulfillment_order.cancelled`: the buyer is out of the delay. */
    onFulfillmentOrderCancelled: (payload: { fulfillmentOrderId: string }) =>
        guarded('fulfillment_order.cancelled', () =>
            clearRecord([TicketKind.consent_due], {
                type: 'fulfillment_order',
                id: payload.fulfillmentOrderId
            })
        ),

    /** `fulfillment_order.delayed`: a delay that may owe the buyer a question. */
    onDelayed: (payload: DomainEventMap['fulfillment_order.delayed'], meta: DomainEventMeta) =>
        guarded('fulfillment_order.delayed', () => {
            const opening = consentDueOpening(payload, ticketsConfig().NODE_TICKETS_FTC_COUNTRIES);
            return opening ? openSystemTicket(opening, meta) : Promise.resolve();
        }),

    /** `account.export_failed`: a person is owed their file. */
    onExportFailed: (payload: DomainEventMap['account.export_failed'], meta: DomainEventMeta) =>
        guarded('account.export_failed', () =>
            openSystemTicket(exportFailedOpening(payload, new Date()), meta)
        ),

    /** `account.export_ready`: a later export is what closes an earlier failure. */
    onExportReady: (payload: DomainEventMap['account.export_ready']) =>
        guarded('account.export_ready', () =>
            clearMatching({
                kind: TicketKind.export_failed,
                subjectId: payload.userId
            })
        )
};
