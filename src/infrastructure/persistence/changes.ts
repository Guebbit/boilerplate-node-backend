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
