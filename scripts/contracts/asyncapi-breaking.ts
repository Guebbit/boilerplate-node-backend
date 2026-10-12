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

/** One break the maintainers decided on, and why — so the gate does not fail on it again. */
export interface AcknowledgedBreak {
    /** The JSON pointer the diff reports, e.g. `/channels/order.shipped`. */
    path: string;
    /** What replaced it, in one line: the review's answer to "who does this break, and what do they do?". */
    reason: string;
}

/**
 * The breaks of the public catalogue that were decided, not stumbled into. An entry silences the
 * diff for that exact pointer only; delete it once the change has reached `origin/main`, where the
 * gate compares against it anyway.
 */
export const ACKNOWLEDGED_BREAKS: readonly AcknowledgedBreak[] = [
    {
        path: '/channels/order.shipped',
        reason: 'An order ships in parts now: `shipment.shipped` fires once per shipment, and the order reaching `shipped` is its last one.'
    },
    {
        path: '/operations/webhookOrderShipped',
        reason: 'Replaced by `webhookShipmentShipped`, with the channel above.'
    }
];

/**
 * The changes between two dereferenced AsyncAPI documents that a subscriber would feel, less the
 * ones {@link ACKNOWLEDGED_BREAKS} names.
 * @param before the base document, as `parsed.json()`
 * @param after the document being checked, same form
 * @param acknowledged breaks to leave out; the maintainers' list unless a test passes its own
 * @returns the breaking changes, empty when there are none
 */
export const breakingChanges = (
    before: object,
    after: object,
    acknowledged: readonly AcknowledgedBreak[] = ACKNOWLEDGED_BREAKS
): DiffOutputItem[] => {
    // @asyncapi/diff: compare two documents, classify each change, keep the breaking ones.
    // `override` (singular: the README says `overrides`, the code reads `override`) replaces
    // the standard's verdict per JSON pointer.
    // https://github.com/asyncapi/diff#readme
    // `.breaking()` is typed as the union of its output formats; the JSON default is an array.
    const breaking: unknown = diff(before, after, { override: OVERRIDES }).breaking();
    const found = Array.isArray(breaking) ? (breaking as DiffOutputItem[]) : [];
    return found.filter(({ path }) => acknowledged.every((one) => one.path !== path));
};
