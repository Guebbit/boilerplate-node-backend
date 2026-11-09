/**
 * @module
 * The version of a stored row, and the write precondition that reads it.
 *
 * ```
 * GET  /x/{id}  → ETag: "<editRevision>.<digest of the body>"
 * PUT  /x/{id}  → If-Match: "<that>"  ─ controller opens a precondition scope (id + tags)
 *                                     └ repository.save / deleteOne meet it, compare the
 *                                       EDIT part only, and fence the write
 * ```
 *
 * The version is `editRevision`, the integer counter `./revision-plugin` moves by an atomic `$inc`
 * on every edit — through `save()` and through query updates alike. It is neither `updatedAt`
 * (two edits in one millisecond share it) nor Mongoose's default `__v` (which moves only when an
 * array changes). An edit that lives outside the row (a role, a translation) moves it by hand,
 * and the writes that are NOT an edit (stock mirror, image digest, session tokens, a password
 * change, the reaper's warning) pass
 * `timestamps: false`, so they never invalidate an editor's copy.
 *
 * The tag has two parts. The digest changes whenever the bytes do (reads compare the whole tag,
 * so a 304 is always safe); a write compares only the edit part, so a sale never refuses an
 * editor's open form. The one registered difference: `if-match-edit-version`.
 *
 * See: docs/api/write-methods.md#conditional-writes-etag-and-if-match
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { EDIT_REVISION } from './revision-plugin';

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
export class PreconditionFailedError extends Error {
    override name = 'PreconditionFailedError';
}

/**
 * The open precondition for the current request, and whether a write has consumed it yet.
 * `AsyncLocalStorage`, like the locale and the caller: the service in the middle never has to
 * know a header existed.
 */
const scopeStorage = new AsyncLocalStorage<{ precondition: Precondition; consumed: boolean }>();

/**
 * The versions of rows that were reshaped into a wire object: a presenter builds a new object, and
 * the counter is deliberately not part of the wire shape, so it rides beside it instead.
 */
const carried = new WeakMap<object, number>();

/**
 * Hands a row's version to the object a presenter built from it, so the `ETag` can still be
 * derived after the reshaping. A row with no version leaves `shaped` as it was.
 *
 * @param source - the stored row (hydrated or lean) or an already-carried wire row
 * @param shaped - the object built from it
 * @returns `shaped`, unchanged but for the carried version
 */
export const carryVersion = <T extends object>(source: unknown, shaped: T): T => {
    const version = versionOf(source);
    if (version !== undefined) carried.set(shaped, version);
    return shaped;
};

/**
 * Reads a row's version: its `editRevision`. Works on a hydrated document, a lean row and a wire
 * object that a presenter or serializer {@link carryVersion carried} it to.
 *
 * @param row - anything that may carry a version
 * @returns the version, or `undefined` for a row that carries none (not a versioned resource)
 */
export const versionOf = (row: unknown): number | undefined => {
    if (typeof row !== 'object' || row === null) return undefined;
    const version = carried.get(row) ?? (row as Record<string, unknown>)[EDIT_REVISION];
    return typeof version === 'number' && Number.isInteger(version) ? version : undefined;
};

/**
 * The strong entity-tag for one answer: `"<version>.<digest>"`, quoted as RFC 9110 §8.8.3 writes
 * one. The digest makes it change with every byte; the version is the part a write compares.
 *
 * @param version - a {@link versionOf} result
 * @param digest - a digest of the exact body sent (URL-safe characters only)
 */
export const etagOf = (version: number, digest: string): string =>
    `"${version.toString()}.${digest}"`;

/**
 * The edit part of a tag {@link etagOf} made.
 *
 * @param tag - one entity-tag as the caller sent it
 * @returns the version, or `undefined` for a weak tag or one this API never sent
 */
export const versionOfTag = (tag: string): number | undefined => {
    const match = /^"(\d+)\.[^"]*"$/.exec(tag);
    return match?.[1] === undefined ? undefined : Number(match[1]);
};

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
 * Makes the open precondition (if any) checkable again.
 *
 * A write inside `withTransaction` that hits a transient conflict is re-run by the driver, and the
 * first run already consumed the precondition: without this the retry would write unchecked over
 * the very edit that caused the conflict. Call it at the start of the transactional work, so each
 * attempt compares the caller's tag with the row it just loaded.
 */
export const rearmPrecondition = (): void => {
    const scope = scopeStorage.getStore();
    if (scope) scope.consumed = false;
};

/**
 * The two ways Mongoose says "the row moved under this write": the fence in {@link fencedSave}
 * matched nothing (`DocumentNotFoundError`), or an array edit's own version filter did
 * (`VersionError`). Compared by name, like the driver errors in `mongo-errors.ts`.
 */
export const isLostRace = (error: unknown): boolean =>
    error instanceof Error &&
    (error.name === 'DocumentNotFoundError' || error.name === 'VersionError');

/**
 * Whether the open precondition (if any) is about this document and still unconsumed. Consumes it:
 * a second save of the same row in one request has, by then, a version the caller never saw.
 *
 * @param document - the row about to be written
 * @param key - what the route calls this row: its `_id`, or another id the path carries
 */
const takePrecondition = (document: { _id?: unknown }, key: string): Precondition | undefined => {
    const scope = scopeStorage.getStore();
    if (!scope || scope.consumed || key !== scope.precondition.id) return undefined;
    scope.consumed = true;
    return scope.precondition;
};

/**
 * Whether the row's current version is one the caller's header accepts: the edit part of any tag
 * sent equals it (the digest part is for reads, never compared here).
 *
 * @param precondition - the open precondition
 * @param version - the row's current {@link versionOf}
 */
const accepts = (precondition: Precondition, version: number | undefined): boolean =>
    precondition.etags === 'any'
        ? true
        : version !== undefined && precondition.etags.some((tag) => versionOfTag(tag) === version);

/**
 * Runs `write` with the loaded counter added to the filter of the document's write (Mongoose:
 * `Document#$where`, "additional properties to attach to the where clause when saving"), so a
 * write that lost the race matches nothing. `null` stands for a row with no counter, which
 * Mongo's `null` matches.
 *
 * The fence comes off once the write has settled: Mongoose keeps `$where` on the document, so a
 * second save of the same object would otherwise still filter on a counter the first one moved.
 *
 * @param document - the hydrated document about to be written
 * @param write - the write itself
 */
const armed = <T>(document: { editRevision?: unknown }, write: () => Promise<T>): Promise<T> => {
    Object.assign(document, { $where: { [EDIT_REVISION]: document.editRevision ?? null } });
    return write().finally(() => {
        Reflect.deleteProperty(document, '$where');
    });
};

/**
 * Checks a `save()` against the open precondition, and fences it.
 *
 * The check compares the version the service LOADED with the caller's tag. The fence closes the
 * gap between that load and the write: Mongoose adds `$where` to the update's filter, so a
 * write that lost the race matches nothing and surfaces as {@link PreconditionFailedError}
 * instead of overwriting.
 *
 * No precondition, or one about another row: `write` runs exactly as it always did.
 *
 * @param document - the hydrated document about to be saved
 * @param write - `document.save()`
 * @param key - the id the route names this row by; `_id` unless the path carries another one
 *   (a language is addressed by its tag)
 * @throws {PreconditionFailedError} when the tag no longer matches
 */
export const fencedSave = <T>(
    document: { _id?: unknown; editRevision?: unknown },
    write: () => Promise<T>,
    key = String(document._id)
): Promise<T> => {
    const precondition = takePrecondition(document, key);
    if (!precondition) return write();
    if (!accepts(precondition, versionOf(document)))
        return Promise.reject(new PreconditionFailedError());

    return armed(document, write).catch((error: unknown) => {
        throw isLostRace(error) ? new PreconditionFailedError() : error;
    });
};

/**
 * The filter that fences a query update (`updateOne`) on the open precondition: the document's
 * counter must be one the caller's header names. Uses the precondition up, like
 * {@link fencedSave}.
 *
 * Version `0` also matches a row with no counter yet (Mongo's `null` matches a missing field); a
 * header that parses to no version gives an empty `$in`, so nothing matches and the write is a 412.
 *
 * @param key - the id the route names the row by
 * @param path - the counter's path on the row, normally {@link EDIT_REVISION}
 * @returns `{}` when there is no precondition about this row, or it is `*`
 */
export const preconditionFilter = (key: string, path: string): Record<string, unknown> => {
    const precondition = takePrecondition({}, key);
    if (!precondition || precondition.etags === 'any') return {};
    const versions = precondition.etags
        .map((tag) => versionOfTag(tag))
        .filter((version) => version !== undefined);
    return { [path]: { $in: versions.includes(0) ? [...versions, null] : versions } };
};

/**
 * What a document `deleteOne()` resolves to: the driver's count of rows it removed.
 */
export interface DeleteOutcome {
    /** `0` when the fence matched nothing — the row moved, or is already gone. */
    deletedCount: number;
}

/**
 * Checks a document `deleteOne()` against the open precondition, and fences it the way
 * {@link fencedSave} does: Mongoose applies `Document#$where` to a document delete too (9.9.5,
 * `Model.prototype.deleteOne`), so a row edited between the load and the delete is not removed.
 *
 * @param document - the hydrated document about to be removed
 * @param write - `document.deleteOne()`
 * @throws {PreconditionFailedError} when the tag no longer matches, or the fence matched nothing
 */
export const checkedDelete = (
    document: { _id?: unknown; editRevision?: unknown },
    write: () => Promise<DeleteOutcome>
): Promise<void> => {
    const precondition = takePrecondition(document, String(document._id));
    if (!precondition) return write().then(() => undefined);
    if (!accepts(precondition, versionOf(document)))
        return Promise.reject(new PreconditionFailedError());

    return armed(document, write).then(({ deletedCount }) => {
        if (deletedCount === 0) throw new PreconditionFailedError();
    });
};
