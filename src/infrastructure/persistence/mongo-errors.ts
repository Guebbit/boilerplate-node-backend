/**
 * @module
 * Driver-level facts about a Mongo write failure — checks a repository or the HTTP error
 * interpreter can make without reaching into the response layer for something that is really a
 * driver fact, not an HTTP one.
 */

import mongoose from 'mongoose';

/**
 * Mongo's duplicate-key error (E11000): a write a unique index refused.
 *
 * One definition because every caller reads it slightly differently — a repository as a retry
 * signal on a racing upsert, `http/errors.ts`'s interpreter as "already taken" (409) — and the
 * list of who calls it is not worth keeping here; it only goes stale. The CODE is checked, not
 * the message, because E11000's text names the index and would break the first time one is
 * renamed.
 */
export const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: number } | undefined)?.code === 11_000;

/**
 * A malformed id reaching Mongoose as a `CastError` on the `_id`/ObjectId path, rather than a
 * miss — the honest answer for one is the same 404 a well-formed unknown id gets. One definition
 * because every `.catch()` on a `findById`-style read narrows the same fact by hand today: a
 * `.catch()` callback's argument is `unknown`, never provably a `CastError`, so this is the only
 * safe way to ask.
 * @param error - whatever the caught rejection actually was
 */
export const isBadObjectId = (error: unknown): boolean =>
    error instanceof mongoose.Error.CastError && error.kind === 'ObjectId';
