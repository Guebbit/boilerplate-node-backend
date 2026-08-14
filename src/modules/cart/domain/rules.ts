/**
 * Cart rules. Pure: data in, verdict out — no status codes, no i18n; `services/` maps verdicts.
 * See `docs/theory/domain-layer.md`.
 */

/** A cart line as the rules see it. `null` is what `populate()` writes for a deleted product. */
export interface CartLineCandidate {
    quantity?: number;
    /** The joined product. Only `stock` is read; an absent `stock` means the column predates
     *  the backfill and the line is treated as unconstrained. */
    product?: { stock?: number } | null;
}

/** Reasons are named, not numbered: the checkout-failure analytics event reports them verbatim. */
export type CheckoutVerdict =
    | { ok: true }
    | { ok: false; reason: 'empty' }
    | { ok: false; reason: 'product-unavailable' }
    | { ok: false; reason: 'insufficient-stock' };

/**
 * May this cart become an order?
 * Mirrors `orders`' `checkOrderLines`, deliberately unshared: a cart is a draft, an order a commitment.
 *
 * The stock verdict here is the PRE-FLIGHT half of the guarantee — the half that turns an
 * obviously doomed checkout into a clean refusal before anything is written. The half that
 * holds under concurrency is the repository's conditional decrement, which re-checks the same
 * rule inside the write; this one existing does not excuse that one.
 *
 * @param lines - the cart's lines, already joined to their products
 * @returns `ok`, or the reason checkout is refused
 */
export const evaluateCheckout = (lines: readonly CartLineCandidate[]): CheckoutVerdict => {
    if (lines.length === 0) return { ok: false, reason: 'empty' };
    if (lines.some(({ product }) => product === undefined || product === null))
        return { ok: false, reason: 'product-unavailable' };
    if (
        lines.some(
            ({ product, quantity }) =>
                product?.stock !== undefined && (quantity ?? 0) > product.stock
        )
    )
        return { ok: false, reason: 'insufficient-stock' };
    return { ok: true };
};
