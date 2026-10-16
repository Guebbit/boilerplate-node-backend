/**
 * @module
 * Order rules. Pure: data in, verdict out — no status codes, no i18n; `../services/place` maps verdicts.
 * See `docs/theory/domain-layer.md`.
 */

/** A line as the rules see it. Absent `product` means the reference no longer resolves. */
export interface OrderLineCandidate {
    quantity?: number;
    product?: unknown;
}

/** The verdict `checkOrderLines` returns: accepted, or refused with the specific reason why. */
export type OrderLinesVerdict =
    | { ok: true }
    | { ok: false; reason: 'no-lines' }
    | { ok: false; reason: 'product-missing' };

/**
 * Can these lines become an order?
 * Order matters: the two reasons map to different status codes.
 * @param lines - candidate lines, already joined to their products
 * @returns `ok`, or the reason the whole set is refused
 */
export const checkOrderLines = (lines: readonly OrderLineCandidate[]): OrderLinesVerdict => {
    if (lines.length === 0) return { ok: false, reason: 'no-lines' };
    if (lines.some(({ product }) => product === undefined || product === null))
        return { ok: false, reason: 'product-missing' };
    return { ok: true };
};

/** The three facts about a product that decide whether it may be put on an order. */
export interface SellableCandidate {
    /** `false` hides the product from shoppers. */
    active?: boolean;
    /** `false` takes it off sale: listed, not buyable. */
    purchasable?: boolean;
    /** Set once the product is soft-deleted. */
    deletedAt?: Date | null;
}

/**
 * Whether a product may be sold: shown, on sale and not deleted. The same three facts checkout
 * refuses a line on, so an operator raising an order sells exactly the shelf a shopper does.
 * @param product - the product as stored, not as an order line froze it
 */
export const isSellable = (product: SellableCandidate): boolean =>
    product.active !== false && product.purchasable !== false && !product.deletedAt;

/** The buyer as an order carries it: an ObjectId on a stored order, a string on a hand-built one. */
interface HasBuyer {
    userId?: string | { toString: () => string } | null;
}

/**
 * The id of the account an order belongs to, as the caller's own id is spelled, or `undefined` when
 * the account was erased and the order kept. The one place an order's buyer becomes a string.
 * @param order - anything carrying the order's `userId`
 */
export const buyerIdOf = (order: HasBuyer): string | undefined =>
    order.userId ? String(order.userId) : undefined;

/**
 * Is `caller` the order's buyer? Never for an erased buyer, and never for a caller with no id.
 * @param order - anything carrying the order's `userId`
 * @param caller - whoever is asking, or `undefined` for a path with no request behind it
 */
export const isBuyer = (order: HasBuyer, caller: { id?: string | null } | undefined): boolean => {
    const buyer = buyerIdOf(order);
    return buyer !== undefined && buyer === caller?.id;
};

/** A line as {@link isShippedItem} sees it — only the field it actually reads. */
export interface ShippableLineCandidate {
    product?: { requiresShipping?: unknown } | null;
}

/**
 * Whether this line rides in a parcel — absent `requiresShipping` counts as shipped, the product
 * schema's own default. The frozen, post-checkout twin of `@modules/cart`'s own `isShippedLine`
 * (`cart/domain/rules.ts`): same predicate, applied to an order's embedded product snapshot
 * instead of a joined cart line, since the two shapes differ post-freeze.
 */
export const isShippedItem = (line: ShippableLineCandidate): boolean =>
    line.product?.requiresShipping !== false;

/**
 * Whether every line on this order is digital — nothing here would ever ride in a parcel, so
 * `ship`/`deliver` have nothing to do; `fulfill` is this order's door instead. An order with no
 * lines is never digital-only: there is nothing to call "digital" about it either.
 */
export const isDigitalOnlyOrder = (lines: readonly ShippableLineCandidate[]): boolean =>
    lines.length > 0 && lines.every((line) => !isShippedItem(line));
