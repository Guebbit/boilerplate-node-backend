/**
 * @module
 * In any module: the one place a stored row becomes the wire shape `openapi.yaml` declares, so
 * every read and write answers with the same thing. Here, the one field a document cannot supply
 * is `ownerName`, which belongs to `users`.
 */

import type { Example } from '@types';
import type { ExampleDocument, ExampleRow } from './model';

/**
 * A document as the contract's `Example`.
 *
 * `.toJSON()` applies the model's transform (`_id` to `id`, owner as hex); Mongoose types its
 * result `any`, and the single cast below is what makes it an {@link ExampleRow}. Dates stay
 * `Date` until the response is serialized, which is what turns them into ISO strings.
 *
 * @param document - the stored example
 * @param ownerName - the owner's display name, read from `users` by the caller
 */
export const presentExample = (document: ExampleDocument, ownerName: string): Example => ({
    ...(document.toJSON() as ExampleRow),
    ownerName
});

/**
 * A search row (already in wire shape) as the contract's `Example`.
 *
 * @param row - one row of a repository search
 * @param ownerName - the owner's display name
 */
export const presentExampleRow = (row: ExampleRow, ownerName: string): Example => ({
    ...row,
    ownerName
});
