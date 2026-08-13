/**
 * Order rules. Pure: data in, verdict out — no status codes, no i18n; `service.ts` maps verdicts.
 * See `docs/theory/domain-layer.md`.
 */

/** A line as the rules see it. Absent `product` means the reference no longer resolves. */
export interface IOrderLineCandidate {
    quantity?: number;
    product?: unknown;
}

export type TOrderLinesVerdict =
    | { ok: true }
    | { ok: false; reason: 'no-lines' }
    | { ok: false; reason: 'product-missing' };

/**
 * Can these lines become an order?
 * Order matters: the two reasons map to different status codes.
 * @param lines - candidate lines, already joined to their products
 * @returns `ok`, or the reason the whole set is refused
 */
export const checkOrderLines = (lines: readonly IOrderLineCandidate[]): TOrderLinesVerdict => {
    if (lines.length === 0) return { ok: false, reason: 'no-lines' };
    if (lines.some(({ product }) => product === undefined || product === null))
        return { ok: false, reason: 'product-missing' };
    return { ok: true };
};
