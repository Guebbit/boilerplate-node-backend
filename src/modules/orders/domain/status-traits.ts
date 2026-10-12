/**
 * @module
 * What each order status means, declared once. Every question the module asks of a status alone
 * ("is its stock committed", "may the buyer still withdraw") reads this record instead of listing
 * statuses of its own.
 *
 * Total on purpose: `satisfies Record<OrderStatus, ...>` makes a status added to the contract fail
 * the build here, rather than fall into a wrong category by default.
 *
 * See `docs/modules/orders.md#status-traits`.
 */

import { OrderStatus } from '@types';
import type { OrderFulfillmentStatus } from '@types';

/**
 * Everything the module knows about one status.
 *
 * Fields:
 *   stockCommitted: the stock hold is `committed` or later (payment settled, not given up)
 *   beforeDispatch: nothing has left the shop yet, so a withdrawal is a cancel, not a return
 *   withdrawable:   the consumer's right of withdrawal may be exercised from here
 *   fulfillment:    where the goods stand; `value` is the answer, and `followsSummary` says
 *                   whether `delivery`'s summary may refine it (partially fulfilled, on hold)
 */
export interface OrderStatusTraits {
    readonly stockCommitted: boolean;
    readonly beforeDispatch: boolean;
    readonly withdrawable: boolean;
    readonly fulfillment: {
        readonly value: OrderFulfillmentStatus;
        readonly followsSummary: boolean;
    };
}

/**
 * The traits of every status. `withdrawable` is "contract concluded, not cancelled" — `pending`
 * counts, because the buyer's right does not wait for their own payment (CRD Art. 9).
 */
export const ORDER_STATUS_TRAITS = {
    pending: {
        stockCommitted: false,
        beforeDispatch: true,
        withdrawable: true,
        fulfillment: { value: 'unfulfilled', followsSummary: false }
    },
    paid: {
        stockCommitted: true,
        beforeDispatch: true,
        withdrawable: true,
        fulfillment: { value: 'unfulfilled', followsSummary: true }
    },
    processing: {
        stockCommitted: true,
        beforeDispatch: true,
        withdrawable: true,
        fulfillment: { value: 'in_progress', followsSummary: true }
    },
    shipped: {
        stockCommitted: true,
        beforeDispatch: false,
        withdrawable: true,
        fulfillment: { value: 'shipped', followsSummary: false }
    },
    delivered: {
        stockCommitted: true,
        beforeDispatch: false,
        withdrawable: true,
        fulfillment: { value: 'fulfilled', followsSummary: false }
    },
    cancelled: {
        stockCommitted: false,
        beforeDispatch: false,
        withdrawable: false,
        fulfillment: { value: 'unfulfilled', followsSummary: false }
    }
} as const satisfies Record<OrderStatus, OrderStatusTraits>;

/**
 * Every status whose traits satisfy `test`, in contract order.
 * @param test - the question asked of one status's traits
 */
export const statusesWhere = (
    test: (traits: OrderStatusTraits) => boolean
): readonly OrderStatus[] =>
    Object.values(OrderStatus).filter((status) => test(ORDER_STATUS_TRAITS[status]));
