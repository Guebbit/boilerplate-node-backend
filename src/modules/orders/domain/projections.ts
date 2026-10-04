/**
 * @module
 * The three statuses that sit beside an order's own `status` — Shopify's `financial_status`,
 * `fulfillment_status` and `returnStatus`. `orders` cannot import `payments` or `returns`, so it
 * cannot derive the money or the return on read: those two are STORED, stamped by the owning module
 * through this module's own service door (the way `delivery` reports a shipment). The fulfilment
 * one needs nothing from outside, so it is derived from `status` alone.
 *
 * Pure — no I/O, so every mapping is testable at its edges.
 */

import { OrderStatus, OrderPaymentStatus, OrderReturnStatus } from '@types';
import type { OrderFulfillmentStatus } from '@types';

/** The refund states `payments` stamps. `unpaid` and `paid` are derived, never stored. */
export const STAMPED_PAYMENT_STATUSES = [
    OrderPaymentStatus.partially_refunded,
    OrderPaymentStatus.refunded
] as const satisfies readonly OrderPaymentStatus[];

/** One refund state `payments` stamps. */
export type StampedPaymentStatus = (typeof STAMPED_PAYMENT_STATUSES)[number];

/** The return states `returns` stamps. `none` is the absence of a stamp, never stored. */
export const STAMPED_RETURN_STATUSES = [
    OrderReturnStatus.requested,
    OrderReturnStatus.in_progress,
    OrderReturnStatus.partially_returned,
    OrderReturnStatus.returned
] as const satisfies readonly Exclude<OrderReturnStatus, 'none'>[];

/** One return state `returns` stamps. */
export type StampedReturnStatus = (typeof STAMPED_RETURN_STATUSES)[number];

/**
 * Where the goods stand, from the order's status alone: nothing has happened until work starts, and
 * a cancelled order never ships.
 * @param status - the order's status
 */
export const fulfillmentStatusOf = (status: OrderStatus): OrderFulfillmentStatus => {
    switch (status) {
        case OrderStatus.processing: {
            return 'in_progress';
        }
        case OrderStatus.shipped: {
            return 'shipped';
        }
        case OrderStatus.delivered: {
            return 'fulfilled';
        }
        default: {
            return 'unfulfilled';
        }
    }
};

/**
 * Where the money stands. A stamped refund state wins; otherwise the order is `paid` once it has
 * ever been paid (`paidAt`) and `unpaid` before that.
 * @param stamped - the refund state `payments` last stamped, if any
 * @param paidAt - when the order reached `paid`, if it did
 */
export const paymentStatusOf = (
    stamped: StampedPaymentStatus | undefined,
    paidAt: Date | undefined
): OrderPaymentStatus => stamped ?? (paidAt ? 'paid' : 'unpaid');

/**
 * Where any return stands: the stamp `returns` last wrote, or `none`.
 * @param stamped - the return state `returns` last stamped, if any
 */
export const returnStatusOf = (stamped: StampedReturnStatus | undefined): OrderReturnStatus =>
    stamped ?? 'none';
