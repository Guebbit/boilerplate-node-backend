/**
 * @module
 * Turning the repository's atomic yearly counter into the order number format: `{year}-{sequence}`.
 * Not a tax invoice number — this order is a receipt, not an invoice, see
 * `docs/modules/orders.md`. The atomicity itself lives behind the repository
 * (`orderRepository.incrementOrderNumberCounter`) — this file only decides the string.
 */

import { orderRepository } from '../repository';

/**
 * How wide the sequence portion of an order number is padded, e.g. `000041`. A gap in the
 * sequence is acceptable — see {@link allocateOrderNumber}'s own docblock — the same way
 * Shopify's `#1001` can skip a number a failed write burned.
 */
const SEQUENCE_WIDTH = 6;

/**
 * Allocates and formats the next order number for the current UTC year —
 * `{year}-{sequence}`, zero-padded to {@link SEQUENCE_WIDTH} digits (e.g. `2026-000041`).
 *
 * Called once, at order-creation time — the caller stores the result on `Order.orderNumber` —
 * and never again for the same order, so a re-downloaded receipt always shows the same number. If
 * the order write that follows this call fails, the number allocated here is never reused: a
 * documented, acceptable gap rather than a bug, and no rollback is attempted for it.
 *
 * @returns the formatted order number for a new order
 */
export const allocateOrderNumber = (): Promise<string> => {
    const year = new Date().getUTCFullYear();

    return orderRepository
        .incrementOrderNumberCounter(year)
        .then((sequence) => `${year}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`);
};
