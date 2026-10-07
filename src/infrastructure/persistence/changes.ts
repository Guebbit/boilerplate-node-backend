/**
 * @module
 * Applying an update's change-set to a hydrated Mongoose document.
 * See: docs/theory/request-flow.md#put-replaces-patch-merges
 */

/**
 * One field's contribution to a document assignment. `null` in a change-set means "clear this
 * field", and an UNSET path is what a cleared optional field looks like on disk: assigning
 * `undefined` to a hydrated document's path makes `.save()` emit `$unset` for it, rather than
 * store a literal `null`.
 *
 * @param value - a field's value off a change-set
 * @returns `value` unchanged, or `undefined` when it was `null`
 */
export const clearedOrValue = <T>(value: T | null): T | undefined => value ?? undefined;

/** The `$set` and `$unset` halves of one Mongo update; a half with nothing in it is absent. */
export interface SetAndUnset {
    $set?: Record<string, unknown>;
    $unset?: Record<string, 1>;
}

/**
 * Split a change-set into the two operators a Mongo update needs: a field holding a value is
 * `$set`, a field holding `undefined` is `$unset`. An empty half is left out, because Mongo
 * refuses an empty `$set` or `$unset`.
 *
 * @param changes - field path → new value, or `undefined` to clear the field
 * @returns the operators to spread into an update document
 */
export const setAndUnset = (changes: Readonly<Record<string, unknown>>): SetAndUnset => {
    const entries = Object.entries(changes);
    const $set = Object.fromEntries(entries.filter(([, value]) => value !== undefined));
    const $unset = Object.fromEntries(
        entries.filter(([, value]) => value === undefined).map(([path]) => [path, 1 as const])
    );

    return {
        ...(Object.keys($set).length > 0 ? { $set } : {}),
        ...(Object.keys($unset).length > 0 ? { $unset } : {})
    };
};
