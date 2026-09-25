/**
 * @module
 * Cart rules. Pure: data in, verdict out — no status codes, no i18n; `services/` maps verdicts.
 * See `docs/theory/domain-layer.md`.
 */

/**
 * A cart line as the rules see it. `product: null` is what `populate()` writes for a HARD-deleted
 * product — `populate()` follows the reference with no visibility scope of its own, so a soft-
 * deleted or deactivated product still joins successfully, `active`/`deletedAt` included, which
 * is what lets {@link evaluateCheckout} tell "gone" from "here, but not sellable" apart.
 */
export interface CartLineCandidate {
    /** Carried so a refusal can name the product rather than just report that one exists. */
    productId?: string;
    quantity?: number;
    /**
     * The joined product, narrowed to what a refusal needs. `available` is computed by the
     * caller — `@modules/products`'s `availableStock` — since the domain layer may not import a
     * sibling module to compute it itself; absent reads as zero, "nothing to sell" being the safe
     * direction to be wrong in for a rule whose job is to refuse.
     */
    product?: {
        title?: string;
        available?: number;
        active?: boolean;
        deletedAt?: Date;
    } | null;
}

/** One line the cart refused for having no sellable product behind it. */
export interface UnavailableCartLine {
    productId: string;
    /** Absent for a hard-deleted product — there is nothing left to read a title off. */
    title?: string;
}

/** One line the cart cannot check out, and what is actually left. */
export interface CheckoutShortfall {
    productId: string;
    title: string;
    requested: number;
    available: number;
}

/** A cart line as {@link basketWeight} sees it — only the fields it actually sums or filters on. */
export interface WeighedCartLine {
    quantity?: number;
    product?: { weight?: number; requiresShipping?: boolean } | null;
}

/**
 * Whether this line rides in a parcel — the one predicate {@link basketWeight} and
 * {@link needsShipping} share, so "counts toward weight" and "needs a method" never disagree.
 */
const isShippedLine = ({ product }: WeighedCartLine): boolean =>
    product?.requiresShipping !== false;

/**
 * The basket's total weight, in grams — every SHIPPED line's `product.weight` (absent counts as
 * 0, the same rule `Product.weight` documents) times its quantity, summed. A digital good
 * (`requiresShipping: false`) contributes nothing: it never rides in the parcel a method's weight
 * limit is about, so counting it could refuse a method that fits everything actually being
 * shipped. `requiresShipping` absent counts as shipped — the schema's own default, matching every
 * physical product a fixture or an older row never set it on explicitly. Used both to filter
 * `GET /delivery/methods` (advisory) and to refuse a checkout whose chosen method doesn't fit
 * (enforced) — see `services/checkout.ts`.
 *
 * @param lines - the basket's lines, joined to their products
 * @returns the basket's total weight in grams
 */
export const basketWeight = (lines: readonly WeighedCartLine[]): number => {
    let total = 0;
    for (const line of lines) {
        if (!isShippedLine(line)) continue;
        total += (line.product?.weight ?? 0) * (line.quantity ?? 0);
    }
    return total;
};

/**
 * Whether the basket needs a shipment at all.
 *
 * @param lines - the basket's lines, joined to their products
 * @returns `true` when at least one line ships
 */
export const needsShipping = (lines: readonly WeighedCartLine[]): boolean =>
    lines.some((line) => isShippedLine(line));

/** What a checkout still owes delivery, once the basket itself is known good. */
export type ShippingRequirementVerdict =
    | { ok: true }
    | { ok: false; reason: 'method-required' }
    | { ok: false; reason: 'address-required' };

/**
 * Does this checkout have what shipping the basket needs? A digital-only basket needs neither. A
 * basket with any physical line needs a method; if that method itself needs an address
 * (`ShippingMethod.requiresAddress`), it needs one of those too.
 *
 * @param lines - the basket's lines, joined to their products
 * @param method - the chosen shipping method, or `undefined` for none
 * @param hasAddress - whether a shipping address was resolved for this checkout
 * @returns `ok`, or which requirement is missing
 */
export const evaluateShippingRequirement = (
    lines: readonly WeighedCartLine[],
    method: { requiresAddress: boolean } | undefined,
    hasAddress: boolean
): ShippingRequirementVerdict => {
    if (!needsShipping(lines)) return { ok: true };
    if (!method) return { ok: false, reason: 'method-required' };
    if (method.requiresAddress && !hasAddress) return { ok: false, reason: 'address-required' };
    return { ok: true };
};

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
    | { ok: false; reason: 'product-unavailable'; lines: UnavailableCartLine[] }
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

    /*
     * "Unavailable" covers two different facts a joined line can carry: gone entirely
     * (`product` null — a hard delete `populate()` cannot follow), or here but not sellable
     * (`active: false`, or soft-deleted). Every unavailable line, not just the first, same
     * reasoning `shortfalls` below already follows.
     */
    const unavailable = lines
        .filter(
            ({ product }) => !product || product.active === false || product.deletedAt !== undefined
        )
        .map(({ productId, product }) => ({ productId: productId ?? '', title: product?.title }));
    if (unavailable.length > 0)
        return { ok: false, reason: 'product-unavailable', lines: unavailable };
    /*
     * Every short line, not just the first. A customer who trimmed one line only to be refused
     * again on the next is being made to binary-search their own basket.
     */
    const shortfalls = lines
        .filter(({ product, quantity }) => (quantity ?? 0) > (product?.available ?? 0))
        .map(({ productId, product, quantity }) => ({
            productId: productId ?? '',
            title: product?.title ?? '',
            requested: quantity ?? 0,
            available: product?.available ?? 0
        }));
    if (shortfalls.length > 0) return { ok: false, reason: 'insufficient-stock', shortfalls };

    return { ok: true };
};
