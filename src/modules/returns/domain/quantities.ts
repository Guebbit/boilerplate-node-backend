/**
 * @module
 * How much of an order can still come back — pure, so the rule that decides a return's lines is
 * testable without a database.
 */

/** One line of an order, as far as returning it goes. */
export interface OrderedLine {
    productId: string;
    quantity: number;
}

/** A line a customer asks to send back. */
export interface RequestedLine {
    productId: string;
    quantity: number;
}

/**
 * What is left to return per product: what the order held, less what earlier returns took.
 * @param ordered - the order's lines
 * @param alreadyReturned - lines of every earlier return that still holds goods
 * @returns product id → units still returnable (never negative)
 */
export const returnableQuantities = (
    ordered: readonly OrderedLine[],
    alreadyReturned: readonly RequestedLine[]
): Map<string, number> => {
    const remaining = new Map<string, number>();
    for (const { productId, quantity } of ordered)
        remaining.set(productId, (remaining.get(productId) ?? 0) + quantity);
    for (const { productId, quantity } of alreadyReturned)
        remaining.set(productId, Math.max(0, (remaining.get(productId) ?? 0) - quantity));
    return remaining;
};

/** The verdict {@link checkRequestedLines} returns. */
export type LinesVerdict =
    | { ok: true; lines: RequestedLine[] }
    | { ok: false; reason: 'nothing-returnable' | 'unknown-product' | 'too-many' };

/**
 * Decide a return's lines. No lines asked for means "everything that is still left" — the common
 * case, a withdrawal from the whole order. Lines asked for must each name a product on the order
 * and stay within what is left of it; the same product named twice counts once, summed.
 *
 * @param remaining - {@link returnableQuantities}' answer
 * @param requested - the lines the customer sent, or `undefined` for all of what is left
 * @returns the lines to freeze, or why the request cannot stand
 */
export const checkRequestedLines = (
    remaining: ReadonlyMap<string, number>,
    requested: readonly RequestedLine[] | undefined
): LinesVerdict => {
    if (requested === undefined || requested.length === 0) {
        const lines = [...remaining]
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity }));
        return lines.length > 0 ? { ok: true, lines } : { ok: false, reason: 'nothing-returnable' };
    }

    const summed = new Map<string, number>();
    for (const { productId, quantity } of requested)
        summed.set(productId, (summed.get(productId) ?? 0) + quantity);

    for (const [productId, quantity] of summed) {
        if (!remaining.has(productId)) return { ok: false, reason: 'unknown-product' };
        if (quantity > (remaining.get(productId) ?? 0)) return { ok: false, reason: 'too-many' };
    }

    return {
        ok: true,
        lines: [...summed].map(([productId, quantity]) => ({ productId, quantity }))
    };
};
