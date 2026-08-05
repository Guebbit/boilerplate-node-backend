/**
 * Line-item totals.
 *
 * Orders and carts are the same arithmetic over the same shape — a list of
 * `{ quantity, product: { price } }` — so the formula, and the rounding that goes with it, is
 * written once here rather than once per consumer. The two differ only in what they call the
 * result, because `openapi.yaml` names the fields differently per resource:
 *
 * | here       | Order        | CartSummary     |
 * |------------|--------------|-----------------|
 * | `count`    | `totalItems` | `itemsCount`    |
 * | `quantity` | `totalQuantity` | `totalQuantity` |
 * | `price`    | `totalPrice` | `total`         |
 */

/**
 * A priced line item. Deliberately structural and loose: order items arrive as plain aggregate
 * output (`Record<string, unknown>`) while cart items are DTOs, and both are coerced below.
 */
export interface ILineItem {
    quantity?: unknown;
    product?: unknown;
}

export interface ILineItemTotals {
    /** Number of distinct line items. */
    count: number;
    /** Sum of `quantity` across every line. */
    quantity: number;
    /** Sum of `product.price × quantity` across every line, rounded to cents. */
    price: number;
}

/**
 * Round a monetary amount to cents.
 *
 * Money as a float is a pre-existing choice (`openapi.yaml` types these `number`/`double`);
 * rounding keeps `0.1 + 0.2` style drift out of responses.
 */
export const toCents = (value: number): number => Math.round(value * 100) / 100;

/**
 * Sum a list of priced line items.
 *
 * `Number(…) || 0` absorbs undefined, null and unparseable values: a line whose product failed to
 * populate contributes nothing rather than turning the whole total into `NaN`.
 */
export const sumLineItems = (items: readonly ILineItem[]): ILineItemTotals => {
    let quantity = 0;
    let price = 0;

    for (const item of items) {
        const itemQuantity = Number(item.quantity) || 0;
        const itemPrice = Number((item.product as { price?: unknown } | undefined)?.price) || 0;
        quantity += itemQuantity;
        price += itemPrice * itemQuantity;
    }

    return { count: items.length, quantity, price: toCents(price) };
};
