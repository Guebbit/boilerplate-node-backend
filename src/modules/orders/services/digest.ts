/**
 * @module
 * The two figures the daily staff digest reads off the orders: bank transfers about to lapse, and
 * paid orders nobody has shipped. Counts only, so the digest holds no order data.
 *
 * See: docs/modules/notifications.md#the-daily-digest
 */

import { DAY_MS, HOUR_MS } from '@domain-primitives/time';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { orderRepository } from '../repository';

/** What the digest counts on the orders side. */
export interface OrdersDigest {
    /** Bank-transfer orders still unpaid whose `payBy` is within the window (or already past). */
    transfersDue: number;
    /** Paid orders not handed to a carrier for longer than the allowance. */
    unshipped: number;
}

/**
 * Count what the orders owe staff attention to.
 *
 * @param now - the instant the windows are measured from
 * @param allowance - how soon a transfer's `payBy` counts, and how long a paid order may wait
 * @param allowance.transferHours - a transfer counts when `payBy` falls within this many hours
 * @param allowance.unshippedDays - a paid order counts after this many days without a shipment
 */
export const ordersDigest = (
    now: Date,
    { transferHours, unshippedDays }: { transferHours: number; unshippedDays: number }
): Promise<OrdersDigest> =>
    Promise.all([
        orderRepository.count({
            status: 'pending',
            paymentMethod: 'bank_transfer',
            deletedAt: null,
            payBy: { $lte: new Date(now.getTime() + transferHours * HOUR_MS) }
        }),
        orderRepository.count({
            status: { $in: ['paid', 'processing'] },
            deletedAt: null,
            paidAt: { $lte: new Date(now.getTime() - unshippedDays * DAY_MS) }
        })
    ]).then(([transfersDue, unshipped]) => ({ transfersDue, unshipped }));

/**
 * The shipping method each order froze at checkout, for the digest's "tracked, no code" question.
 *
 * @param orderIds - the orders asked about
 * @returns order id to method id; an order that froze none has an `undefined` method
 */
export const shippingMethodsOf = (
    orderIds: readonly string[]
): Promise<Map<string, string | undefined>> =>
    orderIds.length === 0
        ? Promise.resolve(new Map<string, string | undefined>())
        : orderRepository
              .findAll(
                  { _id: { $in: orderIds.map((id) => toObjectId(id)) } },
                  { limit: orderIds.length }
              )
              .then(
                  (orders) =>
                      new Map(orders.map((order) => [String(order._id), order.shippingMethod]))
              );
