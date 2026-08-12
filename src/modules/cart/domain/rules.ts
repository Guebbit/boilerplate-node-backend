/**
 * Cart rules. Pure: data in, verdict out — no status codes, no i18n; `services/` maps verdicts.
 * See `docs/theory/domain-layer.md`.
 */

/** A cart line as the rules see it. `null` is what `populate()` writes for a deleted product. */
export interface ICartLineCandidate {
    quantity?: number;
    product?: unknown;
}

/** Reasons are named, not numbered: the checkout-failure analytics event reports them verbatim. */
export type TCheckoutVerdict =
    | { ok: true }
    | { ok: false; reason: 'empty' }
    | { ok: false; reason: 'product-unavailable' };

/**
 * May this cart become an order?
 * Mirrors `orders`' `checkOrderLines`, deliberately unshared: a cart is a draft, an order a commitment.
 * @param lines - the cart's lines, already joined to their products
 * @returns `ok`, or the reason checkout is refused
 */
export const evaluateCheckout = (lines: readonly ICartLineCandidate[]): TCheckoutVerdict => {
    if (lines.length === 0) return { ok: false, reason: 'empty' };
    if (lines.some(({ product }) => product === undefined || product === null))
        return { ok: false, reason: 'product-unavailable' };
    return { ok: true };
};
