/**
 * @module
 * Status moves other modules REPORT to `orders`, never request — `payments` settling money,
 * `delivery` recording a parcel's handover and arrival. `orders` is the only status writer in this
 * application; a reporting module asks for the move, this file decides whether it still applies
 * and announces it once it lands.
 *
 * See `docs/theory/tactical-ddd.md` §1 "Who writes the status".
 */

import { announceInTransaction, announceWithin, type OutboxAnnouncements } from '@kernel/outbox';
import { inventoryService } from '@modules/inventory';
import { ORDER_STATUS_CHANGED } from '../events';
import { OrderStatus } from '@types';
import type { ClientSession } from 'mongoose';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { statusChangedEvent } from './announce';
import { withTimeline } from './timeline';
import {
    ORDER_EVENTS,
    isDigitalOnlyOrder,
    type OrderEventName,
    type TimelineEntryInput,
    conformityUntilFrom,
    deliveryClockFor,
    withdrawUntilFrom,
    type DeliveryClock,
    type StampedPaymentStatus,
    type StampedReturnStatus
} from '../domain';
import { withdrawalPeriodDays } from '../config';

/** The timeline row each system move leaves. */
const MOVE_ROW = { start: 'processing', ship: 'shipped' } as const;

/**
 * Write a move and announce it: inside the caller's transaction when it has one (the caller wakes
 * the relay after its commit), in a transaction of its own otherwise.
 * @param session - the caller's open transaction, if any
 * @param write - the conditional status write
 * @param announce - builds the event(s) from the order the write returned
 */
const announceMove = (
    session: ClientSession | undefined,
    write: (active: ClientSession) => Promise<OrderDocument | null>,
    announce: (order: OrderDocument) => OutboxAnnouncements<typeof ORDER_STATUS_CHANGED>
): Promise<OrderDocument | null> =>
    session ? announceWithin(session, write, announce) : announceInTransaction(write, announce);

/**
 * Make the move a named lifecycle event describes, and announce it once it lands — the shape every
 * move in this file shares, since each is `system` reporting a fact another module already
 * recorded, never a request a human made.
 *
 * `from`:      the event's own `from` set, so the table is the only place it is declared.
 * Conditional: two callers racing the same fact (a redelivered webhook, a retried delivery scan)
 *              land, and announce, it exactly once.
 *
 * @param orderId - the order to move
 * @param event - the lifecycle event making the move; a single-`from` one, since the announcement
 *   names the status the order left
 * @param session - the caller's transaction, when the move belongs to one; absent, it opens its own
 * @param actor - the person whose act caused the move, for the timeline; absent for the system
 * @returns the order as it now stands, or `null` if this call did not move it
 */
const markSystemMove = (
    orderId: string,
    event: 'start' | 'ship',
    session?: ClientSession,
    actor?: string | null
): Promise<OrderDocument | null> => {
    const { from, to } = ORDER_EVENTS[event];
    return announceMove(
        session,
        withTimeline(
            (active) =>
                orderRepository.updateStatusIfIn(orderId, [...from], to, { session: active }),
            () => [{ type: MOVE_ROW[event], actor }]
        ),
        () => statusChangedEvent(orderId, from[0], to)
    );
};

/**
 * Report that a payment settled. `payments`' `settlePayment` is the one caller — see that
 * module's docblock for why there is only one place money is reconciled.
 *
 * Its own conditional write (`repository.ts`'s `markPaid`), not {@link markSystemMove}: `paid` is
 * the one destination that stamps an extra fact (`paidAt`) in the same write, which
 * `markSystemMove`'s shared `$set` has no slot for. `invoicing` subscribes to the
 * `ORDER_STATUS_CHANGED` event emitted below to issue the order's invoice — see
 * `docs/modules/invoicing.md`.
 *
 * Paid means stock committed: the order's own rule, as cancelled means stock released. The hold's
 * `held → committed` claim therefore lands in the same transaction as the status move.
 *
 * Money can land after the hold was released (the window closed, the cancel not yet run). The
 * units are then taken again before the `paid` write: enough, and the order is paid as usual;
 * short, it is not written `paid` and this answers `null`, so the payment is refunded and the
 * late cancel ends the order. See `docs/modules/inventory-reservations.md`.
 * @param orderId - the order the payment was for
 * @param paymentMethod - `card` when the provider took the money: the order then says so, even if
 *   checkout chose bank transfer (a customer who changed their mind). Offline money leaves the
 *   checkout choice alone — the payment row carries the recorded method
 * @param by - for the timeline: the `actor` who recorded offline money (absent for the provider
 *   and the system) and the `method` the payment row carries, which says how it was really paid
 * @param session - the settlement's transaction, when the move belongs to one; absent, the move
 *   opens its own. Inside one, the caller wakes the outbox relay once it has committed. The stock
 *   cache needs nothing from the caller: a preorder this payment serves announces itself, and
 *   `inventory` refreshes its own copy
 * @returns the order as it now stands, or `null` if it could no longer be paid
 */
export const markPaid = (
    orderId: string,
    paymentMethod?: 'card',
    by: { actor?: string | null | undefined; method?: string | undefined } = {},
    session?: ClientSession
): Promise<OrderDocument | null> => {
    const { from, to } = ORDER_EVENTS.pay;
    const movePaid = withTimeline(
        (active) => orderRepository.markPaid(orderId, from[0], paymentMethod, active),
        (order) => [
            {
                type: 'paid',
                actor: by.actor,
                data: { method: by.method ?? paymentMethod ?? order.paymentMethod ?? null }
            }
        ]
    );
    return announceMove(
        session,
        (active) =>
            // Money that lands after the hold was released takes its units again FIRST. Short, the
            // order is not written `paid`: `null` sends the payment down the refund path, and the
            // late cancel ends the order. Retaken but the order could no longer be paid, the
            // units go back, so a cancelled order never keeps stock.
            inventoryService.retakeReleasedForOrder(orderId, active).then((retake) => {
                if (retake === 'short') return null;
                return movePaid(active).then((order) => {
                    if (order)
                        return inventoryService.commitForOrder(orderId, active).then(() => order);
                    if (retake === 'none') return null;
                    return inventoryService
                        .releaseForOrder(orderId, 'release', active)
                        .then(() => null);
                });
            }),
        () => statusChangedEvent(orderId, from[0], to)
    );
};

/**
 * Report that fulfilment started on a paid order. `delivery`'s own door for this move —
 * `POST /delivery/order/{id}/start` — is the one caller; the admin override
 * (`orders/services/override.ts`'s `overrideStatus`) reaches `processing` too, but does not call
 * this function — `applyOverride` writes that move itself.
 * @param orderId - the order fulfilment started on
 * @param session - the caller's transaction, when this move belongs to one (a forced first
 *   shipment makes it implicitly); absent, the move opens its own
 * @param actor - the staff member who started it, for the timeline
 * @returns the order as it now stands, or `null` if it was not awaiting fulfilment
 */
export const markProcessing = (
    orderId: string,
    session?: ClientSession,
    actor?: string | null
): Promise<OrderDocument | null> => markSystemMove(orderId, 'start', session, actor);

/**
 * Report that the last unit left: nothing remains to ship anywhere. `delivery`'s shipping act
 * calls this inside its own transaction, after it has written the shipment — the shipment record
 * is the fact, this is the report of it. A shipment that leaves units behind never reaches here:
 * the order stays `processing`, and `fulfillmentStatus` says `partially_fulfilled`.
 * @param orderId - the order the shipment belongs to
 * @param session - the act's transaction; this move commits with the shipment or not at all
 * @param actor - the staff member who shipped, for the timeline
 * @returns the order as it now stands, or `null` if it was not awaiting shipment
 */
export const markShipped = (
    orderId: string,
    session?: ClientSession,
    actor?: string | null
): Promise<OrderDocument | null> => markSystemMove(orderId, 'ship', session, actor);

/**
 * The timeline row a move into `delivered` leaves: when the withdrawal window closes rides on it,
 * since the buyer's own screen quotes that date.
 * @param withdrawUntil - the frozen deadline
 * @param actor - the person whose act delivered the order, if any
 */
const deliveredRow = (
    withdrawUntil: Date,
    actor: string | null | undefined
): TimelineEntryInput => ({
    type: 'delivered',
    actor,
    data: { withdrawUntil: withdrawUntil.toISOString() }
});

/**
 * Report that the last undelivered shipment arrived, with nothing left to ship. `delivery`'s
 * delivery act calls it inside its own transaction.
 *
 * The withdrawal period starts here, for goods (Consumer Rights Directive Art. 9(2)(b)(i), "the
 * last good"): `orders` cannot read `delivery`'s own timestamps, so the door hands over the
 * LATEST arrival, and the deadline is frozen with the status — the same "freeze the fact at the
 * moment it happens" rule `shippingCost` and `currency` follow.
 * @param orderId - the order the shipments belong to
 * @param deliveredAt - when the last shipment arrived, as `delivery` recorded it
 * @param session - the act's transaction
 * @param actor - the staff member who recorded the arrival, for the timeline
 * @returns the order as it now stands, or `null` if it was not awaiting arrival
 */
export const markDelivered = (
    orderId: string,
    deliveredAt: Date,
    session?: ClientSession,
    actor?: string | null
): Promise<OrderDocument | null> => {
    const { from, to } = ORDER_EVENTS.deliver;
    const clock: DeliveryClock = {
        withdrawUntil: withdrawUntilFrom(deliveredAt, withdrawalPeriodDays()),
        conformityUntil: conformityUntilFrom(deliveredAt)
    };
    return announceMove(
        session,
        withTimeline(
            (active) => orderRepository.markDelivered(orderId, from[0], clock, active),
            () => [deliveredRow(clock.withdrawUntil, actor)]
        ),
        () => statusChangedEvent(orderId, from[0], to)
    );
};

/**
 * Report that the order became complete in one act: every unit is accounted for and every
 * shipment has arrived. Two acts do that — a digital fulfilment, and a remainder cancel that
 * lands after every shipment was delivered — and each makes both moves at once, in one write:
 * `processing -> shipped -> delivered` (a digital-only order has no `shipped` step, so it announces
 * the one `fulfilmentComplete` move).
 *
 * The clock starts at `at` for goods — the later of the last delivery and the cancellation, since
 * the order only became complete then — and at payment for digital content (Art. 9(2)(c)).
 * @param orderId - the order that became complete
 * @param at - the instant the order became complete
 * @param session - the act's transaction
 * @param actor - the staff member whose act completed it, for the timeline
 * @returns the order as it now stands, or `null` if it was not `processing`
 */
export const markFulfilmentComplete = (
    orderId: string,
    at: Date,
    session: ClientSession,
    actor?: string | null
): Promise<OrderDocument | null> =>
    orderRepository.findInSession(orderId, session).then((order) => {
        const { from } = ORDER_EVENTS.fulfilmentComplete;
        // The table's tuples are literal types; widened so `includes` accepts any status.
        if (!order || !(from as readonly OrderStatus[]).includes(order.status)) return null;

        const clock = deliveryClockFor(order, at, withdrawalPeriodDays());
        const events: readonly OrderEventName[] = isDigitalOnlyOrder(order.items)
            ? ['fulfilmentComplete']
            : ['ship', 'deliver'];
        return announceWithin(
            session,
            withTimeline(
                (active) => orderRepository.markDelivered(orderId, order.status, clock, active),
                () => [
                    ...(events.includes('ship') ? [{ type: 'shipped' as const, actor }] : []),
                    deliveredRow(clock.withdrawUntil, actor)
                ]
            ),
            () =>
                events.map((name) =>
                    statusChangedEvent(orderId, ORDER_EVENTS[name].from[0], ORDER_EVENTS[name].to)
                )
        );
    });

/**
 * Report where an order's money stands once a refund exists. `payments`' own door for this — the
 * order cannot ask `payments`, so `payments` tells it, the same shape as {@link markShipped}. Only
 * the two refund states are reported: `unpaid` and `paid` are derived from `paidAt` on read.
 *
 * @param orderId - the order whose payment was refunded
 * @param paymentStatus - `partially_refunded` while some of the money is still with the shop,
 *   `refunded` once all of it went back
 * @param session - the refund settlement's transaction, so the stamp and the settlement commit or
 *   roll back together
 */
export const markPaymentStatus = (
    orderId: string,
    paymentStatus: StampedPaymentStatus,
    session?: ClientSession
): Promise<boolean> => orderRepository.setProjection(orderId, { paymentStatus }, session);

/**
 * Report where the order's returns stand. `returns`' own door for this. `undefined` clears it: no
 * return holds goods, which is the `none` a reader sees.
 *
 * @param orderId - the order the returns belong to
 * @param returnStatus - the state to show, or `undefined` for none
 */
export const markReturnStatus = (
    orderId: string,
    returnStatus: StampedReturnStatus | undefined
): Promise<boolean> => orderRepository.setProjection(orderId, { returnStatus });
