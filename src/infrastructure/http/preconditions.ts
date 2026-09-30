/**
 * @module
 * The HTTP half of conditional writes (RFC 9110 §13.1.1): read `If-Match` off a write, open the
 * precondition scope the repository checks, and put the `ETag` on the answer. The version itself
 * and the check live in `src/infrastructure/persistence/versioning.ts`; nothing here knows what a row looks like.
 *
 * See: docs/api/write-methods.md#conditional-writes-etag-and-if-match
 */

import type { Request, Response } from 'express';
import {
    etagOf,
    runWithPrecondition,
    versionOf,
    type Precondition
} from '@infrastructure/persistence/versioning';

/**
 * `*`, or a comma-separated list of entity-tags, each optionally weak (`W/`) and always quoted —
 * RFC 9110 §13.1.1. Anything else is not a header this API can compare.
 */
const IF_MATCH_SYNTAX = /^\s*(?:\*|(?:W\/)?"[^"]*"(?:\s*,\s*(?:W\/)?"[^"]*")*)\s*$/;

/**
 * Splits a valid `If-Match` list into its tags, keeping any `W/` prefix: a weak tag never equals
 * the strong one this API sends, which is exactly RFC 9110's strong comparison for `If-Match`.
 */
const tagsOf = (header: string): string[] => header.split(',').map((tag) => tag.trim());

/**
 * Reads a write's `If-Match` into a precondition on one row.
 *
 * A header that does not parse gets an EMPTY tag list — nothing matches it, so the write is
 * refused with 412 rather than silently run unconditionally, which is what the caller was
 * trying to avoid by sending it.
 *
 * @param request - the write request
 * @param id - the row the route addresses
 * @returns the precondition, or `undefined` when the caller sent no `If-Match` (the write is unconditional)
 */
export const preconditionOf = (request: Request, id: string): Precondition | undefined => {
    const header = request.get('If-Match');
    if (header === undefined) return undefined;
    if (!IF_MATCH_SYNTAX.test(header)) return { id, etags: [] };
    return { id, etags: header.trim() === '*' ? 'any' : tagsOf(header) };
};

/**
 * Runs a module's write with the request's `If-Match` (if any) open on row `id`.
 *
 * @param request - the write request
 * @param id - the row the route addresses
 * @param work - the module's write
 * @returns whatever `work` resolved to
 */
export const withIfMatch = <T>(request: Request, id: string, work: () => Promise<T>): Promise<T> =>
    runWithPrecondition(preconditionOf(request, id), work);

/**
 * Stamps `ETag` on a response about one row.
 *
 * Also drops `If-None-Match` from the request. Express would otherwise answer 304 from this tag,
 * and this tag covers the row's own edits only — not the config-derived parts of a
 * representation (prices, language) — so a 304 could serve a stale body. The tag validates
 * WRITES; reads always send the body.
 *
 * @param response - the express response
 * @param row - the row (hydrated, lean or serialized) the body describes
 */
export const setEtag = (response: Response, row: unknown): void => {
    const version = versionOf(row);
    if (version === undefined) return;
    response.setHeader('ETag', etagOf(version));
    delete response.req.headers['if-none-match'];
};
