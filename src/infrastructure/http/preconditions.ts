/**
 * @module
 * The HTTP half of conditional writes (RFC 9110 §13.1.1): read `If-Match` off a write, open the
 * precondition scope the repository checks, and put the `ETag` on the answer. The version itself
 * and the check live in `src/infrastructure/persistence/versioning.ts`; nothing here knows what a row looks like.
 *
 * @see docs/understand/write-methods.md#conditional-writes-etag-and-if-match
 */

import { createHash } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
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
    /**
     * node:crypto sha256, base64url so the digest never needs quoting inside the tag.
     * https://nodejs.org/api/crypto.html#hashdigestencoding
     */
    createHash('sha256').update(JSON.stringify(body)).digest('base64url').slice(0, DIGEST_LENGTH);

/**
 * The responses whose `ETag` this API made. {@link dropUnownedValidators} keeps the tag on a write
 * answer only for these: any other tag on a write is Express's byte-hash, which no `If-Match`
 * would ever accept.
 */
const ownTags = new WeakSet<Response>();

/**
 * Marks a response's `ETag` as one this API made, so a write answer keeps it. For a tag set
 * outside {@link setEtag}: an idempotent replay puts back the tag the first answer stored.
 *
 * @param response - the express response
 */
export const keepEtag = (response: Response): void => {
    ownTags.add(response);
};

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
    keepEtag(response);
    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        response.setHeader('ETag', etagOf(version, digestOf(body)));
        return responseJson(body);
        // The wrapper sets the ETag then returns what the original `json` returns.
    }) as Response['json'];
};

/**
 * Answers a write (create, restore, action) with the row it left behind: its real tag, and
 * `Content-Location` naming the resource the tag belongs to.
 *
 * RFC 9110 §8.8.3 and §15.3.2: a 201's tag conveys the new resource's validator, and §6.4.2 rule 7
 * ties a POST answer's body to a URI only through `Content-Location`. A row that carries no
 * version (not a versioned resource) is answered untagged. A GET needs no `Content-Location`:
 * its own URI is the resource's.
 *
 * @param response - the express response
 * @param row - the row the body describes
 * @param uri - the resource's path on this API, e.g. `/users/abc` (the convention of `Location`)
 */
export const answerAsResource = (response: Response, row: unknown, uri: string): void => {
    if (versionOf(row) === undefined) return;
    setEtag(response, row);
    if (response.req.method !== 'GET' && response.req.method !== 'HEAD')
        response.setHeader('Content-Location', uri);
};

/**
 * Keeps a write answer honest about validators (RFC 9110 §8.8.3, §9.3.4), whoever set them.
 *
 * - A PUT answer loses `ETag` and `Last-Modified`: a validator is allowed only when the stored bytes
 *   are exactly what the client sent, which no PUT here can promise (§15.3.1: the 200 is "the
 *   result of the action", not a representation to cache).
 * - Any other write (not GET/HEAD) keeps an `ETag` only if {@link setEtag} or {@link keepEtag}
 *   marked it. Express's own byte-hash tag is never one a later `If-Match` accepts.
 *
 * Wrapping `writeHead` is what catches Express's own content tag: `res.send` stamps it just
 * before the head is written. Hand-written because `on-headers` is not a dependency.
 * An `If-Match` is still honoured on the way in; only the answer loses its validators.
 *
 * @param request - the request; GET and HEAD are never touched
 * @param response - the response whose head is about to be written
 * @param next - continues the chain
 */
export const dropUnownedValidators: RequestHandler = (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        const writeHead = response.writeHead.bind(response);
        /**
         * Node's `ServerResponse#writeHead` has several overloads; the wrapper forwards whichever
         * one was called. https://nodejs.org/api/http.html#responsewriteheadstatuscode-statusmessage-headers
         */
        response.writeHead = ((...arguments_: Parameters<Response['writeHead']>) => {
            if (request.method === 'PUT' || !ownTags.has(response)) response.removeHeader('ETag');
            if (request.method === 'PUT') response.removeHeader('Last-Modified');
            return writeHead(...arguments_);
            /**
             * `writeHead` is overloaded, so the wrapper's rest-args signature cannot be matched to any
             * one overload; it forwards its arguments untouched.
             */
        }) as Response['writeHead'];
    }
    next();
};
