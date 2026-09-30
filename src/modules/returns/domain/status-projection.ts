/**
 * @module
 * Where the returns on an order stand, as the one word `orders` shows beside its own status — pure,
 * so every state and its boundaries are testable without a database.
 */

import { QUANTITY_HOLDING_RETURN_STATUSES } from './lifecycle';
import type { ReturnStatus } from './lifecycle';

/** A return as the projection sees it. */
export interface ProjectedReturn {
    status: ReturnStatus;
    lines: readonly { productId: string; quantity: number }[];
}

/** What `orders` shows — `undefined` is `none`, the absence of a stamp. */
export type ProjectedReturnStatus =
    | 'requested'
    | 'in_progress'
    | 'partially_returned'
    | 'returned'
    | undefined;

/**
 * Work out where the returns stand.
 *
 * Priority runs from what still needs a person to what is finished: a request awaiting staff shows
 * first, then goods approved and awaited, and only once every return that holds goods has come back
 * does the answer say how much — `returned` when every unit on the order is covered, else
 * `partially_returned`. A declined return holds nothing, so it never appears.
 *
 * @param returns - every return on the order
 * @param ordered - how many units of each product the order held
 */
export const projectReturnStatus = (
    returns: readonly ProjectedReturn[],
    ordered: ReadonlyMap<string, number>
): ProjectedReturnStatus => {
    const holding = returns.filter(({ status }) =>
        QUANTITY_HOLDING_RETURN_STATUSES.includes(status)
    );
    if (holding.length === 0) return undefined;
    if (holding.some(({ status }) => status === 'requested')) return 'requested';
    if (holding.some(({ status }) => status === 'approved')) return 'in_progress';

    const back = new Map<string, number>();
    for (const { lines } of holding)
        for (const { productId, quantity } of lines)
            back.set(productId, (back.get(productId) ?? 0) + quantity);

    const everything = [...ordered].every(
        ([productId, quantity]) => (back.get(productId) ?? 0) >= quantity
    );
    return everything ? 'returned' : 'partially_returned';
};
