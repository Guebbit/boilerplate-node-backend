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
import { statusesLeadingTo } from '../domain';

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
 * @param orderId - the order the payment was for
 * @returns the order as it now stands, or `null` if it could no longer be paid
 */
export const markPaid = (orderId: string): Promise<OrderDocument | null> =>
    markSystemMove(orderId, OrderStatus.paid);

/**
 * Report that a parcel was handed to the carrier. `delivery`'s shipping door calls this only
 * after it has recorded the handover — the parcel record is the fact, this is the report of it.
 * @param orderId - the order the parcel belongs to
 * @returns the order as it now stands, or `null` if it was not awaiting shipment
 */
export const markShipped = (orderId: string): Promise<OrderDocument | null> =>
    markSystemMove(orderId, OrderStatus.shipped);

/**
 * Report that a parcel arrived. `delivery`'s delivery door calls this only after it has recorded
 * the arrival.
 * @param orderId - the order the parcel belongs to
 * @returns the order as it now stands, or `null` if it was not awaiting arrival
 */
export const markDelivered = (orderId: string): Promise<OrderDocument | null> =>
    markSystemMove(orderId, OrderStatus.delivered);
