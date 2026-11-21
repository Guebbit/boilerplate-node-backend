/**
 * @module
 * HTTP response caching: the envelope, the TTL policy and the size gate.
 *
 * Everything here is about caching a RESPONSE. The adapter underneath stores opaque bytes under a
 * key, which is why the JSON envelope, the development TTL clamp and the per-entry byte limit live
 * with the only consumer of all four rather than in `adapters/cache.ts` — a project caching
 * something that is not a response inherits none of them.
 *
 * @see docs/understand/redis-cache.md#cache-flow
 */

import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getJson } from '@guebbit/js-toolkit';
import {
    claimCacheRefresh,
    getCacheValue,
    invalidateCacheTagsLogged,
    setCacheValue
} from '@infrastructure/adapters/cache';
import { bodyRecordOf } from '@infrastructure/http/request';
import { logger } from '@infrastructure/adapters/logger';
import { cacheRequestsTotal } from '@infrastructure/observability/metrics-cache';
import { isRelaxedEnvironment } from '@infrastructure/runtime/config';
import { responseCacheConfig } from '@infrastructure/http/config';
import { HOUR_SECONDS } from '@domain-primitives/time';

/**
 * Enough to replay an HTTP response verbatim, plus the refresh-ahead soft expiry.
 *
 * `staleAt` (epoch ms) is when the entry stops being a HIT and starts being servable-but-stale —
 * strictly before Redis' own TTL, which is `ttl + grace` (see {@link armCacheWrite}) so the bytes
 * are still there to serve during the grace window.
 *
 * `etag` is the tag the miss sent (a versioned read's `"<editRevision>.<digest>"`), replayed on a
 * hit so a miss and a hit send the same tag. Absent on an unversioned read: Express mints its own.
 *
 * `savedAt` (epoch ms) is when the entry was written; a hit turns it into the `Age` header.
 *
 * `contentLanguage` is the label a language-neutral route's controller set (the path's language on
 * a dictionary read), replayed on a hit because nothing else sets it there. Absent elsewhere.
 */
interface CachedResponse {
    status: number;
    body: unknown;
    staleAt: number;
    savedAt: number;
    etag?: string;
    contentLanguage?: string;
}

/**
 * The cache's name in the RFC 9211 `Cache-Status` header (debug only, not in the contract).
 * https://www.rfc-editor.org/rfc/rfc9211
 */
const CACHE_STATUS_NAME = 'api-redis';

/**
 * Whole seconds between two instants, at least 1 so a stale `ttl` is never `-0`.
 * @param fromMs - The earlier instant, epoch ms.
 * @param toMs - The later instant, epoch ms.
 * @returns The rounded-up gap, minimum 1.
 */
const secondsBetween = (fromMs: number, toMs: number): number =>
    Math.max(1, Math.ceil((toMs - fromMs) / 1000));

/**
 * How long a shared cache (edge) or this server (origin) may keep serving a stale entry while one
 * rebuild is in flight — RFC 5861's `stale-while-revalidate`, and the same number both layers use
 * so they agree on what "stale" means.
 *
 * @see docs/understand/redis-cache.md#refresh-ahead-no-stampede-when-a-hot-key-goes-stale
 */
const STALE_WHILE_REVALIDATE_SECONDS = 60;

/**
 * How long a shared cache may serve the last good copy instead of an error page during a 5xx or
 * an unreachable origin — RFC 5861's `stale-if-error`. Advertised only; nothing server-side reads
 * this, since an origin that is down cannot also be the one enforcing it.
 */
const STALE_IF_ERROR_SECONDS = 300;

/** How long {@link environmentCache} keeps an answer: a redeploy shows within a minute. */
const ENVIRONMENT_CACHE_SECONDS = 60;

/**
 * Clamp a route's declared TTL to the development ceiling.
 *
 * Applied where the TTL enters the system (the `setCache` middleware below) rather than at write
 * time, so the `Cache-Control: max-age` header advertises the same lifetime the server will
 * actually honour.
 *
 * @param seconds - TTL declared by the route
 * @returns the TTL to use, capped outside production
 */
export const resolveCacheTtl = (seconds: number): number => {
    if (!isRelaxedEnvironment()) return seconds;

    /**
     * Longest TTL allowed outside production, in seconds: the bound on how long a write that
     * bypassed the API (a seed, a one-off script under `scripts/ops/`, a `mongosh` session) can
     * keep serving a stale answer. Production is never clamped, because there the API is the only
     * writer. `NODE_REDIS_CACHE_DEV_TTL_MAX=0` opts out.
     */
    /** @see docs/understand/redis-cache.md#writes-that-bypass-the-api */
    const max = responseCacheConfig().NODE_REDIS_CACHE_DEV_TTL_MAX;
    if (max <= 0) return seconds;
    return Math.min(seconds, max);
};

/**
 * Serialize a response for storage, or refuse it for being too large.
 *
 * The ceiling is `NODE_REDIS_CACHE_MAX_BYTES`. A cache turns a cheap request into long-lived server
 * state: the key varies with the declared key parameters, so an unauthenticated caller can mint
 * an entry per distinct value and keep every one resident. Bounding the ENTRY is what stops that being an amplifier;
 * bounding the KEY (see {@link getCacheKey}) is what stops the input being one.
 *
 * Serialized once, here, so the size check measures exactly what would be written rather than an
 * estimate of it. Skipping is not a failure: the caller still gets its response, it just will not
 * be replayed from cache, so the endpoint stays correct and only loses an optimisation.
 *
 * @see docs/understand/redis-cache.md#entry-size-is-bounded
 * @param key - the cache key, for the log line
 * @param value - status + body envelope to replay on a later hit
 * @returns the bytes to store, or `undefined` when the response is over the limit
 */
const serializeCachedResponse = (key: string, value: CachedResponse): string | undefined => {
    const payload = JSON.stringify(value);
    const maxCachedBytes = responseCacheConfig().NODE_REDIS_CACHE_MAX_BYTES;
    if (Buffer.byteLength(payload) <= maxCachedBytes) return payload;

    /**
     * Logged rather than silent: an endpoint that never caches is worth noticing, and the
     * usual cause is a response that grew past what its page size was supposed to bound.
     */
    // Stryker disable all
    logger.warn({
        message: 'Redis cache write skipped: response larger than the per-entry limit.',
        key,
        bytes: Buffer.byteLength(payload),
        maxCachedBytes
    });
    // Stryker restore all
    return undefined;
};

/**
 * Whether a parsed value has the fields `CachedResponse` requires (`etag` optional).
 *
 * A stored entry can outlive the shape it was written under — a deploy that changes this
 * interface leaves old Redis entries in place — so a field-by-field check catches that, not just
 * "is it JSON".
 */
const isCachedResponse = (value: unknown): value is CachedResponse =>
    typeof value === 'object' &&
    value !== null &&
    /**
     * The `typeof 'object'` and non-null checks above prove `value` is an object; the cast only
     * allows reading its keys.
     */
    typeof (value as Record<string, unknown>).status === 'number' &&
    typeof (value as Record<string, unknown>).staleAt === 'number' &&
    'body' in value &&
    ['string', 'undefined'].includes(typeof (value as Record<string, unknown>).etag) &&
    ['string', 'undefined'].includes(typeof (value as Record<string, unknown>).contentLanguage) &&
    typeof (value as Record<string, unknown>).savedAt === 'number';

/**
 * Read one stored envelope back.
 *
 * A corrupt value — half-written, hand-edited, or shaped by a since-changed version of this
 * interface — degrades to a cache miss. If the parse failure escaped, one bad key would turn a
 * working endpoint into a 500 until someone deleted it by hand.
 *
 * @param raw - the bytes `getCacheValue` returned
 * @returns the envelope, or `undefined` when it cannot be read
 */
const parseCachedResponse = (raw: string): CachedResponse | undefined => {
    const parsed = getJson(raw);
    return isCachedResponse(parsed) ? parsed : undefined;
};

/**
 * Invalidation tags, fixed for the route or derived from the request.
 * The function form is read when an entry is stored (a 2xx answer) and when a write clears.
 */
export type CacheTags = readonly string[] | ((request: Request) => readonly string[]);

/**
 * The tags a request files its entry under, or clears.
 * @param tags - the route's declaration
 * @param request - the request the function form reads
 * @returns the concrete tag list, `undefined` when none are declared
 */
const resolveTags = (tags: CacheTags | undefined, request: Request): string[] | undefined =>
    typeof tags === 'function' ? [...tags(request)] : tags && [...tags];

/**
 * Extra cache metadata for middleware users.
 */
interface CacheOptions {
    /**
     * Invalidation tags this route's entries are cleared under — see {@link invalidateCache}.
     * A function derives them from the request (`locale:<code>` from the path), so one route
     * files each language's answer under its own tag.
     */
    tags?: CacheTags;
    /**
     * The query parameters this endpoint's answer actually depends on.
     *
     * Required: this is what decides which requests share a cached response, so getting it wrong
     * is a correctness bug, not a missed optimisation. Most routes declare `[]`; search
     * controllers derive theirs from the same Zod schema they validate against.
     */
    keyParameters: readonly string[];

    /**
     * The values those parameters have for THIS request, parsed the way the controller will parse
     * them — so two spellings of one question (`"0e0"` and `0`) share a key, and a request the
     * controller would refuse never gets one.
     *
     * Omitted: the raw body or query values feed the key. Either way only scalars, or arrays of
     * them, ever do; anything else skips the cache.
     *
     * @returns the parsed values, or `undefined` to skip the cache for this request
     */
    keyValues?: (request: Request) => Record<string, unknown> | undefined;

    /**
     * Array parameters whose ORDER is part of the question (`sort`). Every other array is a set:
     * `?id=a&id=b` and `?id=b&id=a` are one entry, so its elements are sorted into the key.
     */
    orderedKeyParameters?: readonly string[];

    /**
     * The cache identity two spellings of ONE question share.
     *
     * Default key starts with `METHOD:path`. Wrong for a search with two spellings, where `GET
     * /products?text=x` and `POST /products/search {text}` reach the same controller and answer —
     * declaring the same `keyAs` on both makes them one entry, so whichever asks first warms
     * the other.
     */
    keyAs?: string;

    /**
     * The success body does not depend on the visitor's language, so the answer is one entry for
     * everyone and says nothing about language.
     *
     * Key:     the language segment is `-`, not `request.locale`.
     * Headers: no `Vary: Accept-Language` from here. The global `attachLocale` skips its own for
     *          the same path, which is why the route must also be in its registry
     *          (`isLanguageNeutral`); a test keeps the two lists equal.
     * Errors:  untouched. They are translated into the visitor's language and never cached, so
     *          `rejectResponse` still labels them.
     *
     * @see docs/understand/redis-cache-keys.md#language-neutral-routes
     */
    languageNeutral?: boolean;

    /**
     * Let the SERVER hold the answer for the full TTL, but make the browser check first.
     *
     * `invalidateCache` clears Redis on write but cannot reach a copy in someone's browser, so for
     * data a person edits and revisits, `max-age` is wrong. This keeps Redis serving while the
     * browser revalidates and gets `304` when the ETag matches — one round trip, edit visible at once.
     *
     * GET only: a POST answer is `no-store` whatever this says, so a route that answers both
     * spellings (`searchCache`) declares it once.
     */
    browserRevalidate?: boolean;

    /**
     * Whether THIS caller's answer is safe to share with every other cacheable caller — a
     * correctness question, same reasoning as `keyParameters`.
     *
     * true:  the caller reads the same guest-visible scope every cacheable caller shares, since
     *        RFC 9111 §3.5 rules out caching an answer that depends on WHO is asking.
     * false: a caller who sees more than a guest (an admin viewing inactive rows) — BYPASSES
     *        Redis for this request, rather than serve or store a wider answer.
     * Safe by: `kernel/access/query.ts#hasAnonymousReadScope`, which compares compiled read
     *          filters, so a role that widens visibility fails it with no cache change.
     *
     * @see docs/understand/redis-cache.md#no-caching-depends-on-who-is-asking
     */
    scopeKey: (request: Request) => boolean;
}

/** Whether a value is a string, a number, a boolean or null — the only leaves a key can carry. */
const isScalar = (value: unknown): value is string | number | boolean | null =>
    value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * One value's spelling inside a key, or `undefined` when it cannot be part of one.
 *
 * Only scalars, or arrays of scalars, qualify: a nested array or object is something no endpoint
 * here keys on, and walking one is how a 100 kB body of `[[[…]]]` throws a `RangeError` out
 * of the key builder. A query string has no types (`?page=1` is the string `'1'`) while a JSON
 * body keeps its own, so scalars are stringified: `{page: 1}` and `?page=1` share one entry.
 *
 * Arrays are sorted unless `ordered` says their sequence means something — the same argument as
 * sorting the parameter NAMES in {@link setCache}.
 *
 * @param raw - the value as the request (or the parser) produced it
 * @param ordered - whether the array's own order is part of the question
 */
const keySpelling = (raw: unknown, ordered: boolean): string | undefined => {
    if (isScalar(raw)) return JSON.stringify(String(raw));
    if (!Array.isArray(raw) || !raw.every(isScalar)) return undefined;
    const spelled = raw.map(String);
    return JSON.stringify(ordered ? spelled : spelled.toSorted());
};

/**
 * The declared parameters a request carries, as the values that identify its answer.
 *
 * With `keyValues` they come from the parsed input; without, from the raw body then query.
 * `Object.hasOwn`, not `in`: the latter walks the prototype chain, so a parameter named
 * `toString` would count as present on every request. Body BEFORE query, which is the `search`
 * surface's own precedence — the key has to be built from the same value the controller will
 * read, or the two disagree about which request this entry answers. The body half holds only for
 * a POST: a GET or HEAD body is never parsed (`app/security.ts`), so it is `undefined` here.
 *
 * @param request - the incoming request
 * @param sortedKeyParameters - the declared parameter names, sorted
 * @param options - carries `keyValues`
 * @returns `name=value` segments, or `undefined` when the cache must be skipped for this request
 */
const keySegments = (
    request: Request,
    sortedKeyParameters: readonly string[],
    options: CacheOptions
): string[] | undefined => {
    const parsed = options.keyValues?.(request);
    if (options.keyValues && !parsed) return undefined;
    // Express 5 leaves `body` undefined when the request carries none, which every GET does.
    const body = bodyRecordOf(request);
    const source = (name: string): { present: boolean; value: unknown } => {
        if (parsed) return { present: parsed[name] !== undefined, value: parsed[name] };
        const fromBody = Object.hasOwn(body, name);
        return {
            present: fromBody || Object.hasOwn(request.query, name),
            value: fromBody ? body[name] : request.query[name]
        };
    };

    const segments: string[] = [];
    for (const name of sortedKeyParameters) {
        const { present, value } = source(name);
        if (!present) continue;
        const spelled = keySpelling(value, options.orderedKeyParameters?.includes(name) ?? false);
        if (spelled === undefined) return undefined;
        segments.push(`${name}=${spelled}`);
    }
    return segments;
};

/**
 * Build one cache key from method + path + the declared parameters + the resolved scope +
 * language, or `undefined` when this request must skip the cache.
 *
 * The parameters are never stored raw: their values are hashed (`sha256`), so the key is a fixed
 * size however long the input was. Locale is in the key because it changes the body (translated
 * copy) — same reasoning as the `Vary` header `applyCacheHeaders` sets — except on a
 * `languageNeutral` route, whose segment is `-`: one entry for every language. The raw query
 * string is deliberately NOT part of the key: query-string order is not stable across clients, and
 * only `keyParameters` can reach the key, so `?anything=else` cannot mint its own entry.
 *
 * The scope segment is always the literal `guest` — `options.scopeKey` only ever gates whether
 * a key is built at all (see {@link CacheOptions.scopeKey}), never which one; `serveOrArm`
 * bypasses Redis entirely, with no key built, when it answers `false`.
 */
const getCacheKey = (
    request: Request,
    sortedKeyParameters: readonly string[],
    options: CacheOptions
): string | undefined => {
    const segments = keySegments(request, sortedKeyParameters, options);
    if (!segments) return undefined;

    /**
     * Path only. `originalUrl` is the sole place the mounted prefix and the route path are
     * already joined, so it is split rather than reassembled from `baseUrl` + `path`.
     */
    const [path] = request.originalUrl.split('?', 1);
    /**
     * A declared identity replaces BOTH halves of the default prefix, because the two spellings
     * it unifies differ in both — `GET /products` and `POST /products/search`.
     */
    const identity = options.keyAs ?? `${request.method}:${path}`;
    /**
     * node:crypto SHA-256, hex: collision-safe for a cache identity, and the same digest whatever
     * the length of what went in. https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
     * No parameters, no digest: the key stays readable for the many routes that declare none.
     */
    const digest =
        segments.length > 0 ? createHash('sha256').update(segments.join('&')).digest('hex') : '';

    return `${identity}?${digest}:guest:${options.languageNeutral ? '-' : (request.locale ?? '-')}`;
};

/**
 * Make a cache-MISS (or claimed-REFRESH) response write itself to Redis as it is sent.
 *
 * Wraps `response.json` rather than hooking `finish`: `json` is the one place that already has the
 * parsed body in hand, so nothing has to re-derive it from the wire bytes later.
 *
 * @param response - the response whose `json` method is being overridden
 * @param cacheKey - key this response will be stored under, on success
 * @param ttl - soft TTL: how long the new entry counts as a HIT
 * @param graceSeconds - stale-but-servable window past `ttl` — the Redis entry itself lives for
 *   `ttl + graceSeconds`, clamped by `serveOrArm` to at most `ttl`
 * @param tags - invalidation tags to pass to `setCacheValue`
 * @param storeContentLanguage - keep the `Content-Language` the controller set, for a hit to replay
 */
const armCacheWrite = (
    response: Response,
    cacheKey: string,
    ttl: number,
    graceSeconds: number,
    tags: string[] | undefined,
    storeContentLanguage: boolean
): void => {
    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        /**
         * Save only successful, FINISHED responses — errors must not become sticky in cache, and
         * 202 is a status about the request, not the resource: caching it would keep answering
         * "still working" long after the work finished, to every caller polling for the result.
         * A draft preview is never stored, even if a later change moved the bypass decision.
         */
        if (
            response.statusCode >= 200 &&
            response.statusCode < 300 &&
            response.statusCode !== 202 &&
            !isDraftPreview(response)
        ) {
            const savedAt = Date.now();
            const payload = serializeCachedResponse(cacheKey, {
                status: response.statusCode,
                body,
                staleAt: savedAt + ttl * 1000,
                savedAt,
                // setEtag's json wrapper runs before this one, so the header is already set.
                etag: response.get('ETag'),
                contentLanguage: storeContentLanguage ? response.get('Content-Language') : undefined
            });
            if (payload !== undefined)
                // eslint-disable-next-line @typescript-eslint/no-floating-promises -- setCacheValue never rejects (it logs a failed write)
                void setCacheValue(cacheKey, payload, ttl + graceSeconds, tags);
        }

        return responseJson(body);
        /**
         * The wrapper takes the same single `body` and returns what the original `json` does, so it
         * fits the method's type.
         */
    }) as Response['json'];
};

/**
 * Send a stored entry: its status, the tag the original answer carried (if any), its `Age`, and
 * its body. With the tag set, Express skips minting one and still answers a matching
 * `If-None-Match` 304.
 *
 * `Age` is the whole seconds since the entry was saved (RFC 9111 §5.1). The `Cache-Control` sent
 * with it is the route's own, so a browser keeps the answer for `max-age` minus `Age` instead of
 * starting a fresh `max-age` on top of the time Redis already held it. A miss sends none.
 *
 * @param response - the response to answer
 * @param cached - the stored envelope
 */
const replay = (response: Response, cached: CachedResponse): void => {
    if (cached.etag !== undefined) response.setHeader('ETag', cached.etag);
    if (cached.contentLanguage !== undefined)
        response.setHeader('Content-Language', cached.contentLanguage);
    response.set('Age', String(Math.max(0, Math.floor((Date.now() - cached.savedAt) / 1000))));
    response.status(cached.status).json(cached.body);
};

/**
 * Set every cache-control header this middleware owns, and decide whether the request is even a
 * candidate for the Redis lookup {@link serveOrArm} does next. The throw guards a mounting
 * mistake (`noStore` already set), not a runtime condition — see
 * `docs/understand/redis-cache.md#response-headers` for the full reasoning behind every header set
 * here and the throw.
 *
 * @param request - decides GET vs POST framing
 * @param response - headers are set on this response; `noStore` is read from it too
 * @param options - the route's declared cache identity — see {@link CacheOptions}
 * @param ttl - the resolved (possibly dev-clamped) TTL used to build `max-age`
 * @param cacheable - `options.scopeKey(request)`'s answer, `false` when the response sets a cookie
 * or is a draft preview —
 *   see {@link CacheOptions.scopeKey}
 * @returns whether this request is a GET — reused by {@link serveOrArm}
 * @throws {Error} on the mounting mistake described above
 */
const applyCacheHeaders = (
    request: Request,
    response: Response,
    options: CacheOptions,
    ttl: number,
    cacheable: boolean
): boolean => {
    if (response.locals.noStore)
        throw new Error(
            'setCache mounted on a route noStore already marked no-store. A route is either ' +
                'cacheable or it is not — remove one of the two. See the comment on noStore ' +
                'in this file.'
        );

    const cacheableRead = request.method === 'GET';

    response.set(
        'Cache-Control',
        isDraftPreview(response)
            ? 'private, no-store'
            : cacheableRead
              ? cacheable
                  ? options.browserRevalidate
                      ? 'public, no-cache'
                      : `public, max-age=${ttl}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}, stale-if-error=${STALE_IF_ERROR_SECONDS}`
                  : 'private, no-cache'
              : 'no-store'
    );
    response.vary('Authorization');
    if (!options.languageNeutral) response.vary('Accept-Language');

    return cacheableRead;
};

/**
 * Serve a cached response straight from Redis, or arm this response to write itself in when it's
 * answered — see {@link armCacheWrite}. The serve-or-arm decision `setCache` exists for.
 *
 * POST is served from Redis only when the route declared `keyAs` — the same declaration that
 * unifies it with its GET twin. Without it a POST would key on `POST:/x/search` and quietly cache
 * whatever the next POST route to mount `setCache` happened to be, including a write.
 *
 * @param request - only used to build the cache key
 * @param response - served from directly on a HIT/STALE, or armed to write on a MISS/REFRESH
 * @param next - called once a decision is made, or with the error on a Redis failure — `.catch`
 *   below turns that into a normal `next(error)` rather than a hung request
 * @param cacheableRead - from {@link applyCacheHeaders}: whether this is a GET
 * @param ttl - the resolved TTL; `<= 0` skips Redis entirely
 * @param sortedKeyParameters - `options.keyParameters`, pre-sorted once at route-registration time
 * @param options - the route's key parameters, tags and cache identity — see {@link CacheOptions}
 * @param cacheable - `options.scopeKey(request)`'s answer; `false` skips Redis entirely, same as
 *   `ttl <= 0` — see {@link CacheOptions.scopeKey}
 * @returns the pending Redis lookup, so a caller (a test, chiefly) can await the whole decision;
 *   `undefined` on the synchronous not-cacheable / ttl<=0 / no-scope / no-key exit
 */
const serveOrArm = (
    request: Request,
    response: Response,
    next: NextFunction,
    cacheableRead: boolean,
    ttl: number,
    sortedKeyParameters: readonly string[],
    options: CacheOptions,
    cacheable: boolean
): Promise<void> | undefined => {
    const servedFromCache = cacheableRead || options.keyAs !== undefined;
    if (!servedFromCache || ttl <= 0 || !cacheable) {
        next();
        return undefined;
    }

    /**
     * The grace window clamped to the resolved TTL: outside production `ttl` may already be
     * clamped to seconds (see resolveCacheTtl), and a fixed 60s grace would hand back most of
     * what that clamp just took — an out-of-band write could still serve a stale answer for
     * nearly a minute after it landed.
     */
    const graceSeconds = Math.min(STALE_WHILE_REVALIDATE_SECONDS, ttl);

    const cacheKey = getCacheKey(request, sortedKeyParameters, options);
    // A value no key can carry (a nested array, say): serve this request uncached.
    if (cacheKey === undefined) {
        next();
        return undefined;
    }
    return (
        getCacheValue(cacheKey)
            .then((raw) => {
                const cachedResponse = raw === undefined ? undefined : parseCachedResponse(raw);

                // Nothing cached — hard-expired, invalidated, or never written. Same as today.
                if (!cachedResponse) {
                    response.set('Cache-Status', `${CACHE_STATUS_NAME}; fwd=miss`);
                    cacheRequestsTotal.inc({ result: 'miss' });
                    armCacheWrite(
                        response,
                        cacheKey,
                        ttl,
                        graceSeconds,
                        resolveTags(options.tags, request),
                        options.languageNeutral === true
                    );
                    next();
                    return;
                }

                // Fast path: still within the soft TTL.
                const decidedAt = Date.now();
                if (decidedAt < cachedResponse.staleAt) {
                    response.set(
                        'Cache-Status',
                        `${CACHE_STATUS_NAME}; hit; ttl=${String(secondsBetween(decidedAt, cachedResponse.staleAt))}`
                    );
                    cacheRequestsTotal.inc({ result: 'hit' });
                    replay(response, cachedResponse);
                    return;
                }

                /**
                 * Past the soft TTL: exactly one caller, across every replica, rebuilds —
                 * everyone else reads back their OWN key's stale body rather than wait. Nobody ever
                 * receives the rebuilder's response object, so this cannot leak across callers —
                 * every caller sharing this key already shares the same answer by construction,
                 * per `options.scopeKey`'s own docblock.
                 */
                return claimCacheRefresh(cacheKey, graceSeconds).then((wonClaim) => {
                    if (!wonClaim) {
                        response.set(
                            'Cache-Status',
                            `${CACHE_STATUS_NAME}; hit; ttl=-${String(secondsBetween(cachedResponse.staleAt, decidedAt))}`
                        );
                        cacheRequestsTotal.inc({ result: 'stale' });
                        replay(response, cachedResponse);
                        return;
                    }

                    response.set('Cache-Status', `${CACHE_STATUS_NAME}; fwd=stale`);
                    cacheRequestsTotal.inc({ result: 'refresh' });
                    armCacheWrite(
                        response,
                        cacheKey,
                        ttl,
                        graceSeconds,
                        resolveTags(options.tags, request),
                        options.languageNeutral === true
                    );
                    next();
                });
            })
            /**
             * A Redis failure here — `getCacheValue` or `claimCacheRefresh` rejecting — must not
             * hang the request: `next(error)` reaches the global handler exactly as an ordinary
             * thrown error would, rather than leaving neither a response nor a next() call ever
             * made.
             */
            .catch(next)
    );
};

/**
 * Cache GET responses in Redis: serve a stored envelope on a hit, or run the controller and let
 * {@link armCacheWrite} store what it answers. A thin sequence of two steps —
 * {@link applyCacheHeaders}, then {@link serveOrArm} — kept as one export because every route
 * mounts them together, never one without the other.
 *
 * @param seconds - TTL for this route's entries; 0 (the default) disables caching entirely
 * @param options - the route's key parameters, tags and cache identity — see {@link CacheOptions}
 * @returns an Express middleware that serves a cached response or falls through to the controller
 */
export const setCache = (seconds = 0, options: CacheOptions) => {
    /**
     * Sorted once, at route-registration time rather than per request: the declaration is static,
     * and sorting it is what makes `?a=1&b=2` and `?b=2&a=1` one entry instead of two.
     */
    const sortedKeyParameters = options.keyParameters.toSorted();

    /**
     * Named, so the `cache-policy-declared` test can tell a `setCache` route from any other when it walks the
     * routers (`tests/support/cached-routes.ts`); an anonymous closure has no name.
     */
    const setCacheMiddleware = (request: Request, response: Response, next: NextFunction) => {
        /**
         * Outside production the TTL is clamped (see resolveCacheTtl) so writes that bypass the
         * API cannot leave stale answers around for an hour — resolved before the headers so
         * browsers are told the lifetime the server will actually honour.
         */
        const ttl = resolveCacheTtl(seconds);
        /**
         * Resolved once, up front: both the headers and the Redis decision below must agree on
         * whether THIS caller may share the cached answer — see CacheOptions.scopeKey.
         * A draft preview wins over `scopeKey`: a caller can hold the staff read of a draft
         * language and still read the guest scope of the catalogue, so the scope alone would
         * share the visitors' entry with a draft answer.
         * A response that already carries a `Set-Cookie` (a dead-session clear from `getAuth`) must
         * not reach a shared cache either: RFC 9111 §7.3 lets one store and replay it to everyone.
         * Only a cookie set BEFORE this middleware is seen, so a cookie writer mounts ahead of it.
         * https://www.rfc-editor.org/rfc/rfc9111.html#section-7.3
         */
        const cacheable =
            !isDraftPreview(response) &&
            response.getHeader('Set-Cookie') === undefined &&
            options.scopeKey(request);
        const cacheableRead = applyCacheHeaders(request, response, options, ttl, cacheable);
        return serveOrArm(
            request,
            response,
            next,
            cacheableRead,
            ttl,
            sortedKeyParameters,
            options,
            cacheable
        );
    };
    /**
     * The contract's `x-cache` spelling of what this route declared, read back by the
     * `cache-policy-declared` test (`tests/support/cached-routes.ts`) to compare VALUES, not only
     * which paths are cached. The declared TTL, not the dev-clamped one: the contract states the
     * production lifetime.
     */
    return Object.assign(setCacheMiddleware, {
        cachePolicy: options.browserRevalidate ? 'revalidate' : `max-age: ${String(seconds)}`,
        languageNeutral: options.languageNeutral === true
    });
};

/**
 * `setCache` for a module's two search spellings — `GET /x` and `POST /x/search` — which must
 * share one `keyAs` identity (see the note on it above) so that whichever spelling asks first
 * warms the other. One declaration for both routes, so they cannot drift apart into two keys.
 *
 * @param entity - the module's cache tag, and half of its `keyAs` — `'products'` → `products:search`
 * @param keyParameters - the module's own schema-derived key parameters
 * @param scopeKey - see {@link CacheOptions.scopeKey} — the module's own guest-equivalence check
 * @param seconds - TTL; defaults to an hour
 * @param keying - the module's parsed key values and its order-significant array parameters, if any
 */
export const searchCache = (
    entity: string,
    keyParameters: readonly string[],
    scopeKey: CacheOptions['scopeKey'],
    seconds = HOUR_SECONDS,
    keying: Pick<CacheOptions, 'keyValues' | 'orderedKeyParameters' | 'browserRevalidate'> = {}
) =>
    setCache(seconds, {
        tags: [entity],
        keyParameters,
        keyAs: `${entity}:search`,
        scopeKey,
        ...keying
    });

/**
 * For a public GET whose answer comes from environment settings only (`/shop`, the payment and
 * delivery method lists): `setCache` for a minute, one entry for everyone, in no language.
 *
 * Tagless on purpose: the answer changes on a redeploy, never by a request, so nothing clears it
 * and an old copy can outlive a redeploy by about two minutes (the 60 s `max-age` plus the 60 s
 * stale-while-revalidate window), longer while the origin is failing (`stale-if-error`, 5 min). `scopeKey` is always true, since no caller sees more.
 */
export const environmentCache = setCache(ENVIRONMENT_CACHE_SECONDS, {
    keyParameters: [],
    languageNeutral: true,
    scopeKey: () => true
});

/**
 * Clear Redis cache groups after successful write operations — e.g. after writing a product,
 * clear the `products` tag.
 *
 * One call covers every instance: the cached responses and tag sets live in shared Redis, so
 * deleting them here is visible to every other replica immediately.
 *
 * @param tags - the cache tags to clear, e.g. `['products']`, or a function of the write's request
 *   (`locale:<code>` from the path or the body)
 * @returns an Express middleware to mount after the write it invalidates
 */
export const invalidateCache =
    (tags: CacheTags) => (request: Request, response: Response, next: NextFunction) => {
        /**
         * Resolved now, not when the response finishes: Express hands `request.params` back to
         * the parent router once the route is done, so by `finish` the path's language is gone.
         */
        const resolved = resolveTags(tags, request) ?? [];

        response.on('finish', () => {
            // Only clear cache after a successful write; failed writes should not wipe valid cache.
            if (response.statusCode < 200 || response.statusCode >= 300) return;

            // eslint-disable-next-line @typescript-eslint/no-floating-promises -- invalidateCacheTagsLogged never rejects (an unreachable Redis is logged and counted)
            void invalidateCacheTagsLogged(resolved);
        });

        next();
    };

/**
 * Whether this response is a staff preview of a draft language — see {@link markDraftPreview}.
 * `setCache` and `privateNoCache` read it, so the preview never reaches Redis or a stored copy.
 */
export const isDraftPreview = (response: Response): boolean =>
    response.locals.draftPreview === true;

/**
 * Mark the response as a draft preview: `private, no-store`, and a flag the cache middlewares
 * above honour (no key built, no Redis read, no Redis write).
 *
 * Mounted BEFORE `setCache`, whose key is built from `request.locale`: run after it, a draft
 * answer would be stored under a live language's key.
 * See docs/understand/redis-cache.md#draft-previews
 */
export const markDraftPreview = (response: Response): void => {
    response.locals.draftPreview = true;
    response.set('Cache-Control', 'private, no-store');
    response.vary('Authorization');
    response.vary('Accept-Language');
};

/**
 * Forbid every cache — browser, proxy, CDN — from storing the response at all. Mounted on the
 * account router, where every endpoint exchanges credentials or changes auth state.
 *
 * Prevents an intermittent silent logout: without it, a cached credential answer (a token mint,
 * the profile read) can revalidate to a bodyless `304`, leaving the client with no access token but
 * a valid refresh cookie — so the UI shows signed-in. `no-store`, not `no-cache`, because `no-cache` still permits
 * storing and revalidating, which is exactly the 304 path that causes this.
 *
 * Marks `response.locals.noStore` for `setCache` above to check and refuse — see that guard.
 *
 * No credential is minted on a GET, so a 304 here can only confirm bytes the caller already
 * holds: a client that sends `If-None-Match` anyway is answered per RFC 9110 §13.1.2.
 */
export const noStore = (_request: Request, response: Response, next: NextFunction) => {
    // A draft preview keeps its `private`: `no-store` either way, but the answer is one person's.
    response.set('Cache-Control', isDraftPreview(response) ? 'private, no-store' : 'no-store');
    response.locals.noStore = true;

    next();
};

/**
 * For a GET whose answer depends on who is asking (`orders`, `users`, `tasks`).
 *
 * Server:  never cached — RFC 9111 §3.5 rules out a shared cache storing an authenticated answer,
 *          and a per-caller key only grows the store for one caller's benefit.
 * Browser: may keep a private copy, unlike {@link noStore}, but must revalidate it first — cheap
 *          with Express's strong ETag (`app.set('etag', 'strong')`): `304` on no change.
 * Vary:    `Authorization`, as `setCache` sets it — an intermediary that ignores `private` must
 *          still learn the answer depends on who asked.
 */
export const privateNoCache = (request: Request, response: Response, next: NextFunction) => {
    if (isDraftPreview(response)) {
        next();
        return;
    }

    response.set('Cache-Control', 'private, no-cache');
    response.vary('Authorization');
    response.vary('Accept-Language');
    next();
};

/**
 * For a GET every caller may keep a copy of, but only after asking the server (`x-cache: revalidate`)
 * — the availability reads, whose answer moves with every sale and is cached by their own module
 * under their own keys, so this layer only sets the headers.
 *
 * Server:  no Redis entry. The module that owns the answer stores and clears it.
 * Browser: `public, no-cache`: it may store the answer and must re-check, a `304` when the ETag
 *          still matches. `public` because the answer is the same for every caller who may see it.
 * Vary:    `Authorization` only. A caller who sees more (staff reading a hidden product) gets
 *          an answer a guest would not, so a shared cache must tell them apart; there is no
 *          `Accept-Language`, because a successful answer carries no words.
 */
export const publicNoCache = (_request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'public, no-cache');
    response.vary('Authorization');
    next();
};
