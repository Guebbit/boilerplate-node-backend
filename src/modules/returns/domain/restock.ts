/**
 * @module
 * Which of a return's units go back on sale when the goods are received. Staff say it per line
 * (a broken unit is set to 0); the default is all of them. Pure, so the rule that keeps a broken
 * unit from reaching the shelf — and from there a backorder buyer — is testable without a database.
 *
 * See: docs/modules/returns.md#what-the-customer-gets-back
 */

/** A line staff gave a restock count for. */
export interface RestockRequest {
    productId: string;
    restock: number;
}

/** A returned line as the rule reads it. */
interface ReturnedLine {
    productId: { toString(): string };
    quantity: number;
}

/** The verdict {@link resolveRestock} returns. */
export type RestockVerdict =
    | {
          ok: true;
          /** One entry per returned line, in the line's own order. */
          restocked: number[];
      }
    | {
          ok: false;
          /** The position in the request of the entry that cannot stand. */
          index: number;
          reason: 'unknown-product' | 'duplicate' | 'too-many';
      };

/**
 * Decide how many units of each returned line go back on sale. A line not named goes back in full,
 * and no request at all puts everything back. A request is refused when it names a product the
 * return does not hold, names one twice, or asks for more than the line's quantity.
 *
 * @param lines - the return's lines (one per product)
 * @param requested - staff's counts, or `undefined` for all of it
 * @returns the count per returned line, or which request entry cannot stand and why
 */
export const resolveRestock = (
    lines: readonly ReturnedLine[],
    requested: readonly RestockRequest[] | undefined
): RestockVerdict => {
    const counts = new Map<string, number>();
    for (const [index, { productId, restock }] of (requested ?? []).entries()) {
        const line = lines.find((one) => String(one.productId) === productId);
        if (!line) return { ok: false, index, reason: 'unknown-product' };
        if (counts.has(productId)) return { ok: false, index, reason: 'duplicate' };
        if (restock > line.quantity) return { ok: false, index, reason: 'too-many' };
        counts.set(productId, restock);
    }

    return {
        ok: true,
        restocked: lines.map(({ productId, quantity }) => counts.get(String(productId)) ?? quantity)
    };
};
