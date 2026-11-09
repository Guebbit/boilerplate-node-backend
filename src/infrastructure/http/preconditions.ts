/**
 * @module
 * The HTTP half of conditional writes (RFC 9110 §13.1.1): read `If-Match` off a write, open the
 * precondition scope the repository checks, and put the `ETag` on the answer. The version itself
 * and the check live in `src/infrastructure/persistence/versioning.ts`; nothing here knows what a row looks like.
 *
 * See: docs/api/write-methods.md#conditional-writes-etag-and-if-match
 */

import { createHash } from 'node:crypto';
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
 * How many characters of the body's sha256 (base64url) the tag's digest keeps: 96 bits, plenty
 * to tell two versions of one resource apart.
 */
const DIGEST_LENGTH = 16;

/**
 * A digest of the exact bytes `response.json` will send for `body`. Nothing in `src` sets
 * Express's `json spaces`/`replacer`/`escape`, so `JSON.stringify` matches the wire bytes.
 */
const digestOf = (body: unknown): string =>
    // node:crypto sha256, base64url so the digest never needs quoting inside the tag.
    // https://nodejs.org/api/crypto.html#hashdigestencoding
    createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, DIGEST_LENGTH);

/**
 * Stamps `ETag` on a response about one row: `"<editRevision>.<digest of this body>"`.
 *
 * The header is set when `response.json` runs, because the digest needs the body. Express then
 * keeps this tag instead of minting its own and answers `If-None-Match` itself: a match on the
 * WHOLE tag is a 304, so a read is never stale (the digest moves with prices, stock, language).
 * A write's `If-Match` compares only the edit part (see `persistence/versioning.ts`).
 *
 * The wrapper is installed after the Redis cache's, so it runs first and the cache stores the tag.
 *
 * @param response - the express response
 * @param row - the row (hydrated, lean or serialized) the body describes
 */
export const setEtag = (response: Response, row: unknown): void => {
    const version = versionOf(row);
    if (version === undefined) return;
    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        response.setHeader('ETag', etagOf(version, digestOf(body)));
        return responseJson(body);
    }) as Response['json'];
};
