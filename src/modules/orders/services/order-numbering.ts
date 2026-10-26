/**
 * @module
 * Turning the repository's atomic yearly counter into the order number format: `{year}-{sequence}`.
 * Not a tax invoice number — this order is a receipt, not an invoice, see
 * `docs/modules/orders.md`. The atomicity itself lives behind the repository
 * (`orderRepository.incrementOrderNumberCounter`) — this file only decides the string.
 */

import { formatYearlySequence } from '@infrastructure/persistence/yearly-counter';
import { yearInZone } from '../domain/shop-time';
import { orderRepository } from '../repository';
import { shopTimezone } from '@modules/shop';

/**
 * `{4-digit year}-{1 to 9 digits}`: the shape a quoted number must have once trimmed. Nine digits
 * is far past what the six-wide sequence reaches and well inside what `Number` holds exactly.
 */
const QUOTED_ORDER_NUMBER = /^(\d{4})-(\d{1,9})$/;

/**
 * The stored form of an order number as a customer typed it: surrounding spaces, a leading `#`
 * (the receipt prints one) and an unpadded sequence are tolerated. The tolerant inverse of
 * {@link allocateOrderNumber}'s format.
 *
 * @param raw - what a filter carried, e.g. `#2026-41` or ` 2026-000041 `
 * @returns the canonical number (`2026-000041`), or `undefined` when it is not a number at all
 */
export const parseOrderNumber = (raw: string): string | undefined => {
    const match = QUOTED_ORDER_NUMBER.exec(raw.trim().replace(/^#\s*/, ''));
    return match ? formatYearlySequence(Number(match[1]), Number(match[2])) : undefined;
};

/**
 * Allocates and formats the next order number for the current year of the shop's calendar (`NODE_SHOP_TIMEZONE`) —
 * `{year}-{sequence}`, zero-padded (e.g. `2026-000041`).
 *
 * Called once, at order-creation time — the caller stores the result on `Order.orderNumber` —
 * and never again for the same order, so a re-downloaded receipt always shows the same number. If
 * the order write that follows this call fails, the number allocated here is never reused: a
 * documented, acceptable gap rather than a bug, and no rollback is attempted for it (Shopify's
 * `#1001` can skip a number a failed write burned the same way).
 *
 * @internal The counter step beneath `placeOrder`; unpublished so no sibling burns a number.
 * @returns the formatted order number for a new order
 */
export const allocateOrderNumber = (): Promise<string> => {
    const year = yearInZone(new Date(), shopTimezone());

    return orderRepository
        .incrementOrderNumberCounter(year)
        .then((sequence) => formatYearlySequence(year, sequence));
};
