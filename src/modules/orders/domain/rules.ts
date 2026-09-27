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
