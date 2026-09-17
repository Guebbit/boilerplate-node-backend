/**
 * @module
 * Order totals — what a list of priced lines adds up to, and what the customer owes on top.
 * Owned by `orders`; `cart` and `payments` read it through the barrel so a cart summary, the
 * order it previews, and the frozen intent can never disagree. The arithmetic runs in minor units
 * and converts once on the way out — see `money.ts`. Nothing here rounds, because there is
 * nothing to round.
 */

import {
    addMoney,
    scaleMoney,
    toDecimalAmount,
    toMinorUnits,
    wholeCount,
    type Money,
    NO_MONEY
} from './money';

/** A priced line. Loose: order items arrive as raw aggregate output, cart items as DTOs. */
export interface LineItem {
    quantity?: unknown;
    /** `unknown` because it is raw aggregate output; `null` is an unpopulated ref. */
    product?: { price?: unknown } | null;
}

/** What `sumLineItems` reports back: how many lines, how many units, and their combined price. */
export interface LineItemTotals {
    /** Number of distinct line items. */
    count: number;
    /** Sum of `quantity` across every line, as whole units. */
    quantity: number;
    /** Sum of `product.price × quantity` across every line, as a decimal amount. */
    price: number;
}

/**
 * Sum a list of priced line items. `toMinorUnits`/`wholeCount` absorb junk, so a line whose
 * product failed to populate contributes nothing rather than turning the total into `NaN`.
 * @param items - the priced lines
 * @returns line count, total quantity, and the total as a decimal amount
 */
export const sumLineItems = (items: readonly LineItem[]): LineItemTotals => {
    let quantity = 0;
    let price: Money = NO_MONEY;

    for (const item of items) {
        // One reading of the quantity for both columns — counted and charged must be the same units.
        const itemQuantity = wholeCount(item.quantity);
        quantity += itemQuantity;
        price = addMoney(price, scaleMoney(toMinorUnits(item.product?.price), itemQuantity));
    }

    // `count` is lines as given; `quantity` is units. A dropped line still counts as a line.
    return { count: items.length, quantity, price: toDecimalAmount(price) };
};

/** An order, as far as its grand total is concerned. */
export interface OrderTotalInput {
    items: readonly LineItem[];
    /**
     * The shipping cost frozen at checkout. `unknown` because it arrives as raw aggregate output,
     * optional because a checkout that chose no delivery method owes nothing for shipping.
     */
    shippingCost?: unknown;
}

/**
 * What the customer owes: the lines plus the frozen shipping cost. `money.ts` owns rounding, this
 * owns composition — the order, its payment intent, and its confirmation email must all agree on
 * this number, so none of them sums it independently.
 * @param order - the order's lines and its frozen shipping cost
 * @returns the grand total as the decimal amount the contract publishes
 */
export const orderTotal = ({ items, shippingCost }: OrderTotalInput): number =>
    toDecimalAmount(addMoney(toMinorUnits(sumLineItems(items).price), toMinorUnits(shippingCost)));
