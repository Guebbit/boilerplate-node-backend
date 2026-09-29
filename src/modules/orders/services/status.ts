/**
 * @module
 * Status moves other modules REPORT to `orders`, never request — `payments` settling money,
 * `delivery` recording a parcel's handover and arrival. `orders` is the only status writer in this
 * application; a reporting module asks for the move, this file decides whether it still applies
 * and announces it once it lands.
 *
 * See `docs/theory/tactical-ddd.md` §1 "Who writes the status".
 */

import { emitDomainEvent } from '@kernel/events';
import { OrderStatus } from '@types';
import type { OrderDocument } from '../model';
import { orderRepository } from '../repository';
import { ORDER_STATUS_CHANGED } from '../events';
import {
    statusesLeadingTo,
    withdrawUntilFrom,
    type StampedPaymentStatus,
    type StampedReturnStatus
} from '../domain';
import { withdrawalPeriodDays } from '../config';

/**
 * Move an order to `to`, from whichever status `ORDER_LIFECYCLE` says a `system` report may
 * follow it from, and announce the move once it lands — the shape every move in this file shares,
 * since each is `system` reporting a fact another module already recorded, never a request a
 * human made.
 *
 * `from`:      read off the table itself via `statusesLeadingTo`, rather than a literal restated
 *              here, so this can never fall out of sync with the table the way a hand-copied
 *              `from` could. `ORDER_LIFECYCLE` permits exactly one `system` edge into each status
 *              this file moves to (see the table's own comments on `paid`/`shipped`/`delivered`),
 *              which is what makes `[0]` below sound rather than a guess.
 * Conditional: two callers racing the same fact (a redelivered webhook, a retried delivery scan)
 *              land, and announce, it exactly once.
 *
 * @param orderId - the order to move
 * @param to - the status being written
 * @returns the order as it now stands, or `null` if this call did not move it
 */
const markSystemMove = (orderId: string, to: OrderStatus): Promise<OrderDocument | null> => {
    const [from] = statusesLeadingTo(to, 'system');
    return orderRepository.updateStatusIfIn(orderId, [from], to).then((updated) => {
        if (updated) void emitDomainEvent(ORDER_STATUS_CHANGED, { orderId, from, to });
        return updated;
    });
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
 * @param orderId - the order the payment was for
 * @returns the order as it now stands, or `null` if it could no longer be paid
 */
export const markPaid = (orderId: string): Promise<OrderDocument | null> => {
    const [from] = statusesLeadingTo(OrderStatus.paid, 'system');
    return orderRepository.markPaid(orderId, from).then((updated) => {
        if (updated)
            void emitDomainEvent(ORDER_STATUS_CHANGED, { orderId, from, to: OrderStatus.paid });
        return updated;
    });
};

/**
 * Report that fulfilment started on a paid order. `delivery`'s own door for this move —
 * `POST /delivery/order/{id}/start` — is the one caller; the admin override
 * (`orders/services/override.ts`'s `overrideStatus`) reaches `processing` too, but does not call
 * this function — `applyOverride` writes that move itself.
 * @param orderId - the order fulfilment started on
 * @returns the order as it now stands, or `null` if it was not awaiting fulfilment
 */
export const markProcessing = (orderId: string): Promise<OrderDocument | null> =>
    markSystemMove(orderId, OrderStatus.processing);

/**
 * Report that a parcel was handed to the carrier. `delivery`'s shipping door calls this only
 * after it has recorded the handover — the parcel record is the fact, this is the report of it.
 * @param orderId - the order the parcel belongs to
 * @returns the order as it now stands, or `null` if it was not awaiting shipment
 */
export const markShipped = (orderId: string): Promise<OrderDocument | null> =>
    markSystemMove(orderId, OrderStatus.shipped);

/**
 * Move an order to `delivered` and freeze its withdrawal deadline, in one write, then announce it.
 * Shared by the two ways an order arrives: a parcel handed over, and a digital order fulfilled.
 * @param orderId - the order that arrived
 * @param from - the status it must currently be in
 * @param withdrawUntil - the last instant a withdrawal is valid
 * @returns the order as it now stands, or `null` if it was not in `from`
 */
const markArrived = (
    orderId: string,
    from: OrderStatus,
    withdrawUntil: Date
): Promise<OrderDocument | null> =>
    orderRepository.markDelivered(orderId, from, withdrawUntil).then((updated) => {
        if (updated)
            void emitDomainEvent(ORDER_STATUS_CHANGED, {
                orderId,
                from,
                to: OrderStatus.delivered
            });
        return updated;
    });

/**
 * Report that a parcel arrived. `delivery`'s delivery door calls this only after it has recorded
 * the arrival.
 *
 * The withdrawal period starts here, for goods (Consumer Rights Directive Art. 9(2)(b)): `orders`
 * cannot read `delivery`'s own timestamp, so the door hands it over, and the deadline is frozen
 * with the status — the same "freeze the fact at the moment it happens" rule `shippingCost` and
 * `currency` follow.
 * @param orderId - the order the parcel belongs to
 * @param deliveredAt - when the parcel arrived, as `delivery` recorded it
 * @returns the order as it now stands, or `null` if it was not awaiting arrival
 */
export const markDelivered = (
    orderId: string,
    deliveredAt: Date
): Promise<OrderDocument | null> => {
    const [from] = statusesLeadingTo(OrderStatus.delivered, 'system');
    return markArrived(orderId, from, withdrawUntilFrom(deliveredAt, withdrawalPeriodDays()));
};

/**
 * Report that a digital-only order was marked fulfilled by staff — `delivery`'s own door for this
 * move (`POST /delivery/order/{id}/fulfill`), the alternative to `markShipped`/`markDelivered` for
 * an order with nothing to physically hand over. Its own fixed `from`/`to` pair, NOT routed
 * through `markSystemMove`: that helper derives `from` from `ORDER_LIFECYCLE` under the assumption
 * of exactly one system edge into each destination status (see its own docblock), and
 * `shipped → delivered` already owns the one edge into `delivered` — adding a second edge there
 * for this move would make `markDelivered` itself derive the WRONG `from` for the ordinary
 * ship/deliver flow. `processing → delivered` is deliberately absent from `ORDER_LIFECYCLE`
 * for exactly this reason; `delivery/service.ts`'s `fulfillOrder` is what actually gates who may
 * call this and when.
 * @param orderId - the order marked fulfilled
 * @returns the order as it now stands, or `null` if it was not awaiting fulfilment
 */
export const markFulfilled = (orderId: string): Promise<OrderDocument | null> =>
    orderRepository.findById(orderId).then((order) => {
        if (!order) return null;
        // Digital content: the period runs from the conclusion of the contract, not from the
        // moment staff marked it fulfilled (Art. 9(2)(a)) — `paidAt` is that moment here.
        const start = order.paidAt ?? new Date();
        return markArrived(
            orderId,
            OrderStatus.processing,
            withdrawUntilFrom(start, withdrawalPeriodDays())
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
 */
export const markPaymentStatus = (
    orderId: string,
    paymentStatus: StampedPaymentStatus
): Promise<boolean> => orderRepository.setProjection(orderId, { paymentStatus });

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
