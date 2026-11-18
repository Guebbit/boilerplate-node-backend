/**
 * @module
 * In any module: the one place a stored row becomes the wire shape `openapi.yaml` declares, so
 * every read and write answers with the same thing.
 * Here: the one field a document cannot supply is `ownerName`, which belongs to `users`; `actions`
 * is decided by the caller's service and handed in, never asked for here.
 *
 * @see docs/understand/layers.md#example-from-this-repo
 */

import type { Example, ExampleActions, ExportExample } from '@types';
import { carryVersion } from '@infrastructure/persistence/versioning';
import type { ExampleDocument, ExampleRow } from './model';

/**
 * A document as the contract's `Example`.
 *
 * `.toJSON()` applies the model's transform (`_id` to `id`, owner as hex); Mongoose types its
 * result `any`, and the single cast below is what makes it an {@link ExampleRow}.
 *
 * @param document - the stored example
 * @param ownerName - the owner's display name, read from `users` by the caller
 * @param actions - what the caller may do to it
 */
export const presentExample = (
    document: ExampleDocument,
    ownerName: string,
    actions: ExampleActions
): Example =>
    carryVersion(document, {
        /**
         * The schema's `toJSON` transform produces the row shape `ExampleRow` names; Mongoose types
         * it as a generic object.
         * `toJSON` leaves no date or id object (`serialize.ts`); the contract tests check the rest.
         */
        ...(document.toJSON() as ExampleRow),
        ownerName,
        actions
    });

/**
 * A search row (already in wire shape) as the contract's `Example`.
 *
 * @param row - one row of a repository search
 * @param ownerName - the owner's display name
 * @param actions - what the caller may do to this row
 */
export const presentExampleRow = (
    row: ExampleRow,
    ownerName: string,
    actions: ExampleActions
): Example =>
    carryVersion(row, {
        ...row,
        ownerName,
        actions
    });

/**
 * A row as the account data export carries it: no `actions`, which is per caller.
 *
 * @param row - one row of a repository read
 * @param ownerName - the owner's display name
 */
export const presentExampleExport = (row: ExampleRow, ownerName: string): ExportExample => ({
    ...row,
    ownerName
});
