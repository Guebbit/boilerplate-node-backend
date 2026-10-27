/**
 * @module
 * What each domain event becomes in the inbox. One function per event, each a mapping from a
 * payload to the rows to write — the module's `subscribe()` wires them to the bus, and the writing
 * itself stays in `./inbox`.
 *
 * Own-message severity is `warning` throughout: each says "something you had changed without you
 * asking", which is worth a look and not an error. Work notices take theirs from `../staff-routing`.
 */

import { Types } from 'mongoose';
import type { DomainEventMap } from '@kernel/events';
import type { NewNotification } from '../repository';
import { notificationsCreate } from './inbox';
import { ticketService } from '@modules/tickets';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { notifyStaff, notifyStaffMember } from './staff';

/** One row per owner of a removed product, all the same message. */
const removedFor = (
    code: 'notifications.cart-line-removed' | 'notifications.wishlist-item-removed',
    { userIds, productId, titles }: DomainEventMap['cart.lines_removed']
): NewNotification[] =>
    userIds.map((userId) => ({
        userId: new Types.ObjectId(userId),
        code,
        severity: 'warning',
        params: { productId, titles }
    }));

/** A product left the catalogue and with it these users' carts. */
export const onCartLinesRemoved = (payload: DomainEventMap['cart.lines_removed']): Promise<void> =>
    notificationsCreate(removedFor('notifications.cart-line-removed', payload));

/** A product left the catalogue and with it these users' wishlists. */
export const onWishlistItemsRemoved = (
    payload: DomainEventMap['wishlist.items_removed']
): Promise<void> => notificationsCreate(removedFor('notifications.wishlist-item-removed', payload));

/** A product the user asked about can be ordered again. */
export const onStockAlertSent = ({
    userId,
    productId,
    titles
}: DomainEventMap['stock_alert.sent']): Promise<void> =>
    notificationsCreate([
        {
            userId: new Types.ObjectId(userId),
            code: 'notifications.stock-alert',
            severity: 'info',
            params: { productId, titles }
        }
    ]);

/** A guest-cart merge could not add some lines at all: one message listing all of them. */
export const onCartMergeRefused = ({
    userId,
    lines
}: DomainEventMap['cart.merge_refused']): Promise<void> =>
    notificationsCreate([
        {
            userId: new Types.ObjectId(userId),
            code: 'notifications.cart-merge-refused',
            severity: 'warning',
            params: { lines }
        }
    ]);

/**
 * A hold gave the buyer something to do or read: the same message in their inbox, so it is still
 * there when the email is not. Staff's reason never gets here, only the notice. An erased account
 * has no inbox to write to.
 */
export const onFulfillmentOrderHoldNoticed = (
    held: DomainEventMap['fulfillment_order.hold_noticed']
): Promise<void> =>
    held.userId === undefined
        ? Promise.resolve()
        : notificationsCreate([
              {
                  userId: new Types.ObjectId(held.userId),
                  code: 'notifications.fulfillment-held',
                  severity: 'warning',
                  params: {
                      orderId: held.orderId,
                      fulfillmentOrderId: held.fulfillmentOrderId,
                      notice: held.notice,
                      ...(held.message ? { message: held.message } : {})
                  }
              }
          ]);

/**
 * A parcel of the buyer's was reported lost or damaged: the same message in their inbox, so it is
 * still there when the email is not. Carries the sentence staff wrote for them and what is still
 * owed, never staff's note. An erased account has no inbox to write to.
 */
export const onShipmentLost = (lost: DomainEventMap['shipment.lost']): Promise<void> =>
    lost.userId === undefined
        ? Promise.resolve()
        : notificationsCreate([
              {
                  userId: new Types.ObjectId(lost.userId),
                  code: 'notifications.shipment-lost',
                  severity: 'warning',
                  params: {
                      orderId: lost.orderId,
                      shipmentId: lost.shipmentId,
                      reason: lost.reason,
                      ...(lost.message ? { message: lost.message } : {}),
                      ...(lost.owed.length > 0
                          ? { owed: lost.owed.map(({ title }) => title) }
                          : {}),
                      ...(lost.expectedAt ? { expectedAt: lost.expectedAt } : {})
                  }
              }
          ]);

/**
 * A waiting preorder's buyer was told its date moved or will be missed: the same message in their inbox, so
 * it is still there when the email is not. It only informs: the buyer is asked nothing. An erased
 * account has no inbox to write to, and nothing here invents one.
 */
export const onFulfillmentOrderDelayed = (
    delayed: DomainEventMap['fulfillment_order.delayed']
): Promise<void> =>
    delayed.userId === undefined
        ? Promise.resolve()
        : notificationsCreate([
              {
                  userId: new Types.ObjectId(delayed.userId),
                  code: 'notifications.fulfillment-delayed',
                  severity: 'warning',
                  params: {
                      orderId: delayed.orderId,
                      fulfillmentOrderId: delayed.fulfillmentOrderId,
                      titles: delayed.titles,
                      agreedAt: delayed.agreedAt,
                      ...(delayed.expectedAt ? { expectedAt: delayed.expectedAt } : {})
                  }
              }
          ]);

/** A buyer's checkout was paused: the staff who can ban hear of it, once per hold taken. */
export const onPurchaseHoldPlaced = ({
    tenantId,
    userId,
    until
}: DomainEventMap['order.purchase_hold_placed']): Promise<void> =>
    notifyStaff({
        tenantId,
        body: { code: 'notifications.staff.purchase-hold-placed', params: { userId, until } },
        dedupeKey: `purchase-hold-placed:${userId}:${until}`
    }).then(() => undefined);

/** A subscription was switched off: the staff who manage webhooks hear of it, once per disable. */
export const onWebhookSubscriptionAutoDisabled = ({
    tenantId,
    subscriptionId,
    disabledAt
}: DomainEventMap['webhook.subscription_auto_disabled']): Promise<void> =>
    notifyStaff({
        tenantId,
        body: { code: 'notifications.staff.webhook-disabled', params: { subscriptionId } },
        dedupeKey: `webhook-disabled:${subscriptionId}:${disabledAt}`
    }).then(() => undefined);

/**
 * A buyer asked to return goods: the staff who decide returns hear of it, once per request. A
 * withdrawal is a right, not a request awaiting a decision (it is born approved), so it is not
 * announced here: the digest counts it while its goods are expected.
 */
export const onReturnRequested = ({
    returnId,
    orderId,
    reason
}: DomainEventMap['return.requested']): Promise<void> =>
    reason === 'withdrawal'
        ? Promise.resolve()
        : notifyStaff({
              tenantId: DEPLOYMENT_TENANT_ID,
              body: { code: 'notifications.staff.return-requested', params: { returnId, orderId } },
              dedupeKey: `return-requested:${returnId}`
          }).then(() => undefined);

/** An outbox event was parked after its last retry: the administrators hear of it, once per event. */
export const onOutboxEventDead = ({
    eventId,
    eventName,
    aggregateId
}: DomainEventMap['outbox.event_dead']): Promise<void> =>
    notifyStaff({
        tenantId: DEPLOYMENT_TENANT_ID,
        body: { code: 'notifications.staff.outbox-dead', params: { eventName, aggregateId } },
        dedupeKey: `outbox-dead:${eventId}`
    }).then(() => undefined);

/**
 * Who hears of a new ticket: the sets that WORK it. A contact message is read by those who may
 * read it (`TicketDisplay`, which includes managers) but worked by `TicketManagement`; alerting
 * the readers too would tell people who cannot act on it.
 *
 * @param opened - the `ticket.opened` fact
 */
const alertSetsOf = ({ kind, routeSet }: DomainEventMap['ticket.opened']): string[] =>
    kind === 'contact' ? ['TicketManagement'] : [routeSet];

/**
 * A ticket was opened: everyone who works its kind hears of it once, by id and kind alone.
 *
 * A contact message nobody could be told of (no staff with an address) goes to the fallback
 * mailbox instead, with the message in it: that mailbox is then the whole inbox. With even one
 * permitted recipient the mailbox hears nothing.
 */
export const onTicketOpened = (opened: DomainEventMap['ticket.opened']): Promise<void> =>
    notifyStaff({
        tenantId: opened.tenantId,
        body: {
            code: 'notifications.staff.ticket-opened',
            params: {
                ticketId: opened.ticketId,
                kind: opened.kind,
                ...(opened.category ? { category: opened.category } : {})
            }
        },
        sets: alertSetsOf(opened),
        dedupeKey: `ticket-opened:${opened.ticketId}`
    }).then((told) =>
        told === 0 && opened.kind === 'contact'
            ? ticketService.mailFallbackMailbox(opened.ticketId)
            : undefined
    );

/** A ticket was given to a colleague: the one who now holds it hears, and nobody else. */
export const onTicketAssigned = (assigned: DomainEventMap['ticket.assigned']): Promise<void> =>
    notifyStaffMember(assigned.assigneeId, {
        tenantId: assigned.tenantId,
        body: {
            code: 'notifications.staff.ticket-assigned',
            params: { ticketId: assigned.ticketId, kind: assigned.kind }
        },
        sets: [assigned.routeSet],
        dedupeKey: `ticket-assigned:${assigned.ticketId}:${assigned.assignedAt}`
    });
