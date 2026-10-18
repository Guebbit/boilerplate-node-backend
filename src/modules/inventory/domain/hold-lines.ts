/**
 * @module
 * Taking some of a hold's lines out of it — pure, so the arithmetic of a partial shipment or a
 * remainder cancel is testable without a database.
 */

import type { HoldKind } from './transitions';

/**
 * A product and how many units of it. `kind` tells units on the shelf from preorder claims; absent
 * means `stock`. A product can sit on a hold under both kinds at once, once part of a preorder is
 * allocated.
 */
export interface HoldLine {
    productId: string;
    quantity: number;
    kind?: HoldKind;
}

/** What {@link takeFromHold} answers. */
export interface HoldTake {
    /** What is still set aside once the lines are out; empty when nothing is left. */
    remaining: HoldLine[];
    /** What actually came out: never more than the hold held of a product. */
    taken: HoldLine[];
}

/** The key a line is counted under: the product and what kind of units they are. */
const keyOf = ({ productId, kind = 'stock' }: HoldLine): string => `${productId}|${kind}`;

/**
 * Take up to `quantity` of one key out of the hold, recording it as taken.
 *
 * @param held - what the hold still sets aside, by key; mutated
 * @param taken - what has come out so far, by key; mutated
 * @param key - the product and kind to take from
 * @param quantity - how many are wanted
 * @returns how many were actually taken
 */
const takeOf = (
    held: Map<string, number>,
    taken: Map<string, number>,
    key: string,
    quantity: number
): number => {
    const take = Math.min(quantity, held.get(key) ?? 0);
    if (take <= 0) return 0;
    held.set(key, (held.get(key) ?? 0) - take);
    taken.set(key, (taken.get(key) ?? 0) + take);
    return take;
};

/**
 * Subtract `lines` from a hold's `items`, per product and kind, never below zero. A line asking for
 * more than the hold holds of that product takes what there is: the hold is the truth about what
 * was set aside, and the counters must move by exactly that.
 *
 * A preorder line asks for the claim first. Units of that product already allocated into shelf
 * units (stock arrived, and the fulfillment order has not yet heard) stand in for what the claim no
 * longer covers, so a cancelled remainder never strands them on a hold with nothing to ship them.
 *
 * @param items - what the hold still sets aside
 * @param lines - what is leaving it (shipped, or cancelled)
 * @returns what remains in the hold and what was actually taken
 */
export const takeFromHold = (items: readonly HoldLine[], lines: readonly HoldLine[]): HoldTake => {
    const held = new Map<string, number>();
    for (const item of items) held.set(keyOf(item), (held.get(keyOf(item)) ?? 0) + item.quantity);

    const taken = new Map<string, number>();
    for (const line of lines) {
        const claimed = takeOf(held, taken, keyOf(line), line.quantity);
        if (line.kind === 'backorder')
            takeOf(held, taken, keyOf({ ...line, kind: 'stock' }), line.quantity - claimed);
    }

    const toLines = (counts: ReadonlyMap<string, number>): HoldLine[] =>
        [...counts]
            .filter(([, quantity]) => quantity > 0)
            .map(([key, quantity]) => {
                const [productId = '', kind] = key.split('|', 2);
                // `stock` is the default, so only a preorder line says so.
                return { productId, quantity, ...(kind === 'backorder' ? { kind } : {}) };
            });

    return { remaining: toLines(held), taken: toLines(taken) };
};
