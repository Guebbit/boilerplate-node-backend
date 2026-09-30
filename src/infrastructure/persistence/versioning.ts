/**
 * @module
 * The version of a stored row, and the write precondition that reads it.
 *
 * ```
 * GET  /x/{id}  → ETag: "<updatedAt in epoch ms>"
 * PUT  /x/{id}  → If-Match: "<that>"  ─ controller opens a precondition scope (id + tags)
 *                                     └ repository.save / deleteOne meet it, compare, and fence the write
 * ```
 *
 * The version is `updatedAt`, not Mongoose's `__v`: `__v` moves only when an array changes, so a
 * scalar edit would leave it — and any ETag built on it — untouched. Every `save()` that changes
 * a `timestamps: true` row moves `updatedAt` atomically, and the writes that are NOT an edit
 * (stock mirror, image digest, session tokens) already pass `timestamps: false`, so they never
 * invalidate an editor's copy.
 *
 * See: docs/api/write-methods.md#conditional-writes-etag-and-if-match
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * What a caller's `If-Match` asks of one row: which row, and which versions it accepts.
 */
export interface Precondition {
    /** The row the header is about — the `:id` of the route. Writes to any other row are not checked. */
    id: string;
    /** The quoted entity-tags the caller sent, or `'any'` for `If-Match: *` (the row merely has to exist). */
    etags: readonly string[] | 'any';
}

/**
 * Raised when a write's `If-Match` no longer describes the stored row. The database-error
 * interpreter answers it with 412, so no controller spells that out.
 */
export class PreconditionFailedError extends Error {}

/**
 * The open precondition for the current request, and whether a write has consumed it yet.
 * `AsyncLocalStorage`, like the locale and the caller: the service in the middle never has to
 * know a header existed.
 */
const scopeStorage = new AsyncLocalStorage<{ precondition: Precondition; consumed: boolean }>();

/**
 * Reads a stored or serialized row's `updatedAt` as epoch milliseconds — the row's version.
 * Works on a hydrated document (`Date`), a lean row (`Date`) and a serialized one (ISO string).
 *
 * @param row - anything that may carry `updatedAt`
 * @returns the version, or `undefined` for a row that carries none
 */
export const versionOf = (row: unknown): number | undefined => {
    if (typeof row !== 'object' || row === null) return undefined;
    const stamp: unknown = (row as { updatedAt?: unknown }).updatedAt;
    const epoch =
        stamp instanceof Date
            ? stamp.getTime()
            : typeof stamp === 'string'
              ? Date.parse(stamp)
              : NaN;
    return Number.isNaN(epoch) ? undefined : epoch;
};

/**
 * The strong entity-tag for a version: the epoch quoted, as RFC 9110 §8.8.3 writes one.
 *
 * @param version - a {@link versionOf} result
 */
export const etagOf = (version: number): string => `"${version.toString()}"`;

/**
 * Runs `work` with `precondition` open, so the first write to that row inside it is checked.
 *
 * @param precondition - the parsed header, or `undefined` for a request that sent none
 * @param work - the module's write
 * @returns whatever `work` resolved to; `work` runs untouched when there is no precondition
 */
export const runWithPrecondition = <T>(
    precondition: Precondition | undefined,
    work: () => Promise<T>
): Promise<T> =>
    precondition ? scopeStorage.run({ precondition, consumed: false }, work) : work();

/**
 * The two ways Mongoose says "the row moved under this write": the fence in {@link fencedSave}
 * matched nothing (`DocumentNotFoundError`), or an array edit's own `__v` filter did
 * (`VersionError`). Compared by name, like the driver errors in `mongo-errors.ts`.
 */
const isLostRace = (error: unknown): boolean =>
    error instanceof Error &&
    (error.name === 'DocumentNotFoundError' || error.name === 'VersionError');

/**
 * Whether the open precondition (if any) is about this document and still unconsumed. Consumes it:
 * a second save of the same row in one request has, by then, a version the caller never saw.
 */
const takePrecondition = (document: { _id?: unknown }): Precondition | undefined => {
    const scope = scopeStorage.getStore();
    if (!scope || scope.consumed || String(document._id) !== scope.precondition.id)
        return undefined;
    scope.consumed = true;
    return scope.precondition;
};

/**
 * Whether the row's current version is one the caller's header accepts.
 *
 * @param precondition - the open precondition
 * @param version - the row's current {@link versionOf}
 */
const accepts = (precondition: Precondition, version: number | undefined): boolean =>
    precondition.etags === 'any'
        ? true
        : version !== undefined && precondition.etags.includes(etagOf(version));

/**
 * Checks a `save()` against the open precondition, and fences it.
 *
 * The check compares the version the service LOADED with the caller's tag. The fence closes the
 * gap between that load and the write: Mongoose adds `$where` to the update's filter (Mongoose:
 * `Document#$where`, "additional properties to attach to the where clause when saving"), so a
 * write that lost the race matches nothing and surfaces as {@link PreconditionFailedError}
 * instead of overwriting.
 *
 * No precondition, or one about another row: `write` runs exactly as it always did.
 *
 * @param document - the hydrated document about to be saved
 * @param write - `document.save()`
 * @throws {PreconditionFailedError} when the tag no longer matches
 */
export const fencedSave = <T>(
    document: { _id?: unknown; updatedAt?: unknown },
    write: () => Promise<T>
): Promise<T> => {
    const precondition = takePrecondition(document);
    if (!precondition) return write();
    if (!accepts(precondition, versionOf(document)))
        return Promise.reject(new PreconditionFailedError());

    // `updatedAt` is compared as stored: the timestamps hook rewrites it in the UPDATE, not in the filter.
    Object.assign(document, { $where: { updatedAt: document.updatedAt } });
    return write().catch((error: unknown) => {
        throw isLostRace(error) ? new PreconditionFailedError() : error;
    });
};

/**
 * Checks a document `deleteOne()` against the open precondition. Check only, no fence: Mongoose
 * gives a delete no `$where`, so a hard delete keeps the load-to-delete window a plain one has.
 *
 * @param document - the hydrated document about to be removed
 * @param write - `document.deleteOne()`
 * @throws {PreconditionFailedError} when the tag no longer matches
 */
export const checkedDelete = <T>(
    document: { _id?: unknown; updatedAt?: unknown },
    write: () => Promise<T>
): Promise<T> => {
    const precondition = takePrecondition(document);
    return precondition && !accepts(precondition, versionOf(document))
        ? Promise.reject(new PreconditionFailedError())
        : write();
};
