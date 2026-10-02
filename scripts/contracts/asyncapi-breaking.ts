/**
 * The classification half of `check-asyncapi-breaking.ts`, kept apart so a test can reach it
 * without running the CLI's top-level git and process-exit flow.
 */

import { diff, type DiffOutputItem, type OverrideObject } from '@asyncapi/diff';

/**
 * Overrides to @asyncapi/diff's built-in standard.
 *
 * `/info/version` is metadata about the document, not a shape a subscriber reads: the standard
 * calls an edit to it breaking, which would make every version bump fail its own gate.
 * Format: https://github.com/asyncapi/diff#overriding-the-standard
 */
export const OVERRIDES: OverrideObject = {
    '/info/version': { add: 'non-breaking', remove: 'non-breaking', edit: 'non-breaking' }
};

/**
 * The changes between two dereferenced AsyncAPI documents that a subscriber would feel.
 * @param before the base document, as `parsed.json()`
 * @param after the document being checked, same form
 * @returns the breaking changes, empty when there are none
 */
export const breakingChanges = (before: object, after: object): DiffOutputItem[] => {
    // @asyncapi/diff: compare two documents, classify each change, keep the breaking ones.
    // `override` (singular: the README says `overrides`, the code reads `override`) replaces
    // the standard's verdict per JSON pointer.
    // https://github.com/asyncapi/diff#readme
    // `.breaking()` is typed as the union of its output formats; the JSON default is an array.
    const breaking: unknown = diff(before, after, { override: OVERRIDES }).breaking();
    return Array.isArray(breaking) ? (breaking as DiffOutputItem[]) : [];
};
