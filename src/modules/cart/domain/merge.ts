/**
 * @module
 * Cart merge rule. Pure: what one guest line becomes, given what the cart holds and whether the
 * product is listed. The cap is passed in — this layer reaches neither the catalogue nor the model.
 * See `docs/theory/domain-layer.md`.
 */

/** Why a merged line did not land exactly as asked — the contract's `MergeLineReason`. */
export type MergeReason = 'summed' | 'capped' | 'unavailable';

/** What one guest line asks the rule to decide on. */
export interface MergeLineFacts {
    /** What the guest line asked for. */
    requested: number;
    /** What the cart already holds of the product. */
    held: number;
    /** Whether the product is publicly visible; a deleted or hidden one takes no line. */
    listed: boolean;
    /** The per-line ceiling. */
    lineMax: number;
}

/** The rule's verdict for one line. */
export interface MergePlan {
    /** Units to add to the cart; `0` writes nothing. */
    add: number;
    /** Absent when the line lands exactly as asked. */
    reason?: MergeReason;
}

/**
 * Decide what one guest line adds to the cart: what `POST /cart` would add, no more.
 *
 * Stock plays no part. A sold-out or short product is added like any other and flagged by the
 * caller through `fitsStock`; lowering the line to what is for sale would let a caller read exact
 * stock by merging 999 (`docs/theory/defences/authorization.md`, "Reading the shelf"). When several
 * reasons apply the one reported is the first that does: `unavailable` (nothing is added at all),
 * `capped`, `summed`. `capped` says the shopper got less than they asked for; `summed` is context.
 *
 * @param facts - the line, what the cart holds, and whether the product is listed
 * @returns how many units to add, and the one reason to report
 */
export const planMergeLine = ({ requested, held, listed, lineMax }: MergeLineFacts): MergePlan => {
    if (!listed) return { add: 0, reason: 'unavailable' };

    const wanted = held + requested;
    const target = Math.min(wanted, lineMax);
    const add = target - held;

    if (target < wanted) return { add, reason: 'capped' };
    if (held > 0) return { add, reason: 'summed' };
    return { add };
};
