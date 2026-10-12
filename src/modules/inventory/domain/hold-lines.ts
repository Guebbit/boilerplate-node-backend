/**
 * @module
 * Taking some of a hold's lines out of it — pure, so the arithmetic of a partial shipment or a
 * remainder cancel is testable without a database.
 */

/** A product and how many units of it. */
export interface HoldLine {
    productId: string;
    quantity: number;
}

/** What {@link takeFromHold} answers. */
export interface HoldTake {
    /** What is still set aside once the lines are out; empty when nothing is left. */
    remaining: HoldLine[];
    /** What actually came out: never more than the hold held of a product. */
    taken: HoldLine[];
}

/**
 * Subtract `lines` from a hold's `items`, per product, never below zero. A line asking for more
 * than the hold holds of that product takes what there is: the hold is the truth about what was
 * set aside, and the counters must move by exactly that.
 *
 * @param items - what the hold still sets aside
 * @param lines - what is leaving it (shipped, or cancelled)
 * @returns what remains in the hold and what was actually taken
 */
export const takeFromHold = (items: readonly HoldLine[], lines: readonly HoldLine[]): HoldTake => {
    const held = new Map<string, number>();
    for (const { productId, quantity } of items)
        held.set(productId, (held.get(productId) ?? 0) + quantity);

    const taken = new Map<string, number>();
    for (const { productId, quantity } of lines) {
        const take = Math.min(quantity, held.get(productId) ?? 0);
        if (take <= 0) continue;
        held.set(productId, (held.get(productId) ?? 0) - take);
        taken.set(productId, (taken.get(productId) ?? 0) + take);
    }

    const toLines = (counts: ReadonlyMap<string, number>): HoldLine[] =>
        [...counts]
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity }));

    return { remaining: toLines(held), taken: toLines(taken) };
};
