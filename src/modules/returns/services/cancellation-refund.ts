/**
 * @module
 * What cancelling a fulfillment order's remainder would refund, from the order and its other
 * returns — one computation for the two callers that need it: the cancel itself, inside its
 * transaction, and `GET /returns/options`, which quotes it before anything is written.
 */

import type { OrderDocument } from '@modules/orders';
import { accountsOf, takesLastUnit } from '../domain';
import type { AccountedReturn, ProductQuantity } from '../domain';
import { cancellationRefundFor, shippingStillOwed, type RefundBreakdown } from './refund-amount';

/**
 * What the order's other returns and cancels have settled, and what this cancel's lines are worth,
 * as the refund the cancel owes.
 *
 * @param order - the order
 * @param earlier - every return on the order, as the transaction reads them
 * @param lines - what this cancel takes
 */
export const cancellationRefundOn = (
    order: OrderDocument,
    earlier: readonly AccountedReturn[],
    lines: readonly ProductQuantity[]
): RefundBreakdown => {
    const accounts = accountsOf(earlier);
    const ordered = order.items.map((item) => ({
        productId: String(item.product._id),
        quantity: item.quantity
    }));
    const price = new Map(
        order.items.map((item) => [String(item.product._id), item.product.price])
    );
    return cancellationRefundFor({
        currency: order.currency,
        lines: lines.map(({ productId, quantity }) => ({
            quantity,
            unitPrice: price.get(productId) ?? 0
        })),
        takesLastUnit: takesLastUnit(ordered, [...accounts.accountedFor, ...lines]),
        shippingPaid: shippingStillOwed(
            order.currency,
            order.shippingCost ?? 0,
            accounts.shippingRefunded
        )
    });
};
