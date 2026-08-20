/**
 * Cart rules. Pure: data in, verdict out — no status codes, no i18n; `services/` maps verdicts.
 * See `docs/theory/domain-layer.md`.
 */

/** A cart line as the rules see it. `null` is what `populate()` writes for a deleted product. */
export interface CartLineCandidate {
    /** Carried so a refusal can name the product rather than just report that one exists. */
    productId?: string;
    quantity?: number;
    /**
     * The joined product, narrowed to what a refusal needs. Both counters are optional and both
     * default to zero — not because a row is expected to lack them (the migration backfills every
     * one) but because "nothing to sell" is the safe direction to be wrong in for a rule whose job
     * is to refuse.
     */
    product?: { title?: string; onHand?: number; reserved?: number } | null;
}

/** One line the cart cannot check out, and what is actually left. */
export interface CheckoutShortfall {
    productId: string;
    title: string;
    requested: number;
    available: number;
}

/**
 * What this line's product has left to sell.
 *
 * A deliberate second copy of `inventory`'s `availabilityOf`: the domain layer may import no
 * sibling module, and two lines of arithmetic is cheaper than opening that door.
 * `tests/unit/domain-rules.test.ts` asserts the two agree, so they cannot drift silently.
 * `inventory` is the authority — if they ever disagree, this one is wrong.
 *
 * @param product - the joined product, or nothing
 * @returns units a customer may still buy
 */
const availableUnits = (product?: { onHand?: number; reserved?: number } | null): number =>
    Math.max(0, (product?.onHand ?? 0) - (product?.reserved ?? 0));

/**
 * Reasons are named, not numbered: the checkout-failure analytics event reports them verbatim.
 *
 * The stock refusal carries the lines that caused it. A verdict that only said "something is
 * short" leaves the customer to find it by editing and retrying, which for a basket of ten lines
 * is ten round trips.
 */
export type CheckoutVerdict =
    | { ok: true }
    | { ok: false; reason: 'empty' }
    | { ok: false; reason: 'product-unavailable' }
    | { ok: false; reason: 'insufficient-stock'; shortfalls: CheckoutShortfall[] };

/**
 * May this cart become an order?
 * Mirrors `orders`' `checkOrderLines`, deliberately unshared: a cart is a draft, an order a commitment.
 *
 * The PRE-FLIGHT half of the guarantee. The half that holds under concurrency is `inventory`'s
 * conditional reserve, which re-checks the same rule inside the write; this one does not excuse
 * that one. It compares against AVAILABILITY, not units on hand — a product whose forty units are
 * all promised has nothing to sell.
 *
 * @param lines - the cart's lines, already joined to their products
 * @returns `ok`, or the reason checkout is refused
 */
export const evaluateCheckout = (lines: readonly CartLineCandidate[]): CheckoutVerdict => {
    if (lines.length === 0) return { ok: false, reason: 'empty' };
    if (lines.some(({ product }) => product === undefined || product === null))
        return { ok: false, reason: 'product-unavailable' };
    /*
     * Every short line, not just the first. A customer who trimmed one line only to be refused
     * again on the next is being made to binary-search their own basket.
     */
    const shortfalls = lines
        .filter(({ product, quantity }) => (quantity ?? 0) > availableUnits(product))
        .map(({ productId, product, quantity }) => ({
            productId: productId ?? '',
            title: product?.title ?? '',
            requested: quantity ?? 0,
            available: availableUnits(product)
        }));
    if (shortfalls.length > 0) return { ok: false, reason: 'insufficient-stock', shortfalls };

    return { ok: true };
};
