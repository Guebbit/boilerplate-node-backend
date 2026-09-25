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

/**
 * Driver/Mongoose error NAMES that mean "no server was reachable", never a request-shape problem
 * — checked the same way `isPermanentConnectError` (`runtime/database.ts`) does: by `.name`, not
 * `instanceof`, since `mongodb` is a transitive
 * dependency of more than one package and an `instanceof` against the wrong copy silently misses.
 */
const CONNECTION_ERROR_NAMES = new Set([
    'MongoServerSelectionError',
    'MongooseServerSelectionError',
    'MongoNetworkError',
    'MongoNotConnectedError',
    'MongoNetworkTimeoutError'
]);

/**
 * Mongoose's own buffering-timeout error carries no dedicated class — it is the bare
 * `MongooseError`, the same base every programmer-error throw in the driver uses — so the
 * well-known message it always ships with is the only signal that distinguishes it from those.
 * https://mongoosejs.com/docs/faq.html#callback_never_executes
 */
const BUFFERING_TIMEOUT_MESSAGE = 'buffering timed out';

/**
 * Whether a Mongo/Mongoose failure means the database was unreachable, as opposed to a request
 * the server understood and refused. The HTTP layer answers this 503 (RFC 9110 §15.6.4, "the
 * server is currently unable to handle the request") rather than the generic 500 a programmer
 * error gets — see `infrastructure/http/errors.ts#databaseErrorInterpreter`.
 *
 * @param error - whatever the caught rejection actually was
 */
export const isConnectionError = (error: unknown): boolean => {
    // Both read as `unknown`: a caught rejection may be any value, and a non-string fails below.
    const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
    if (typeof name !== 'string') return false;
    if (CONNECTION_ERROR_NAMES.has(name)) return true;
    return (
        name === 'MongooseError' &&
        typeof message === 'string' &&
        message.includes(BUFFERING_TIMEOUT_MESSAGE)
    );
};
