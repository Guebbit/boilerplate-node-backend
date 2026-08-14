/**
 * Line-item totals — what a list of priced lines adds up to.
 *
 * Owned by `orders`; `cart` reads it through the barrel, so a cart summary and the order it
 * previews can never disagree. Same number, three names, because `openapi.yaml` names it per
 * resource:
 *
 * | here       | Order           | CartSummary     |
 * |------------|-----------------|-----------------|
 * | `count`    | `totalItems`    | `itemsCount`    |
 * | `quantity` | `totalQuantity` | `totalQuantity` |
 * | `price`    | `totalPrice`    | `total`         |
 */

/** A priced line. Loose: order items arrive as raw aggregate output, cart items as DTOs. */
export interface LineItem {
    quantity?: unknown;
    /** `unknown` because it is raw aggregate output; `null` is an unpopulated ref. */
    product?: { price?: unknown } | null;
}

export interface LineItemTotals {
    /** Number of distinct line items. */
    count: number;
    /** Sum of `quantity` across every line. */
    quantity: number;
    /** Sum of `product.price × quantity` across every line, rounded to cents. */
    price: number;
}

/**
 * Round a monetary amount to cents.
 * Money as a float is a pre-existing choice (`openapi.yaml` types these `number`/`double`);
 * rounding keeps `0.1 + 0.2` style drift out of responses.
 * @param value - the raw amount
 * @returns the amount rounded to two decimal places
 */
export const toCents = (value: number): number => Math.round(value * 100) / 100;

/**
 * Coerce anything to a FINITE number, or 0.
 * `Number(x) || 0` is not enough: `Infinity` is truthy and passes, then `Infinity * 0` is `NaN`
 * and one bad line poisons the whole total. BSON stores `Infinity`, so this is reachable.
 * @param value - anything
 * @returns the finite number it parses to, or 0
 */
const toFiniteNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Sum a list of priced line items.
 * Absorbs undefined, null, unparseable and non-finite values: a line whose product failed to
 * populate contributes nothing rather than turning the whole total into `NaN`.
 * @param items - the priced lines
 * @returns line count, total quantity and total price rounded to cents
 */
export const sumLineItems = (items: readonly LineItem[]): LineItemTotals => {
    let quantity = 0;
    let price = 0;

    for (const item of items) {
        const itemQuantity = toFiniteNumber(item.quantity);
        const itemPrice = toFiniteNumber(item.product?.price);
        quantity += itemQuantity;
        price += itemPrice * itemQuantity;
    }

    // `count` is lines as given; `quantity` is units. A dropped line still counts as a line.
    return { count: items.length, quantity, price: toCents(price) };
};
