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
 * Coerce anything to a FINITE number, or 0.
 *
 * `Number(x) || 0` is not enough, and the difference is not theoretical. `||` rejects `NaN`
 * because `NaN` is falsy, but `Infinity` is truthy and sails straight through — and
 * `Infinity * 0` is `NaN`, so a single line with an infinite quantity and an unpopulated product
 * poisons the whole total. The shape that reaches it is a line with an infinite quantity and no
 * populated product — `{ quantity: Number.POSITIVE_INFINITY }` with `product` absent.
 *
 * Reachable rather than merely possible: BSON stores `Infinity` happily, order items arrive as
 * raw aggregate output, and nothing between the database and here re-validates them.
 */
const toFiniteNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Sum a list of priced line items.
 *
 * Absorbs undefined, null, unparseable values and non-finite ones: a line whose product failed to
 * populate contributes nothing rather than turning the whole total into `NaN`.
 */
export const sumLineItems = (items: readonly ILineItem[]): ILineItemTotals => {
    let quantity = 0;
    let price = 0;

    for (const item of items) {
        const itemQuantity = toFiniteNumber(item.quantity);
        const itemPrice = toFiniteNumber((item.product as { price?: unknown } | undefined)?.price);
        quantity += itemQuantity;
        price += itemPrice * itemQuantity;
    }

    return { count: items.length, quantity, price: toCents(price) };
};
