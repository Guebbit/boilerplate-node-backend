/**
 * @module
 * HTTP response caching: the envelope, the TTL policy and the size gate.
 *
 * Everything here is about caching a RESPONSE. The adapter underneath stores opaque bytes under a
 * key, which is why the JSON envelope, the development TTL clamp and the per-entry byte limit live
 * with the only consumer of all four rather than in `adapters/cache.ts` — a project caching
 * something that is not a response inherits none of them.
 *
 * See: docs/tools/redis-cache.md
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

/**
 * Enough to replay an HTTP response verbatim, plus the refresh-ahead soft expiry.
 *
 * `staleAt` (epoch ms) is when the entry stops being a HIT and starts being servable-but-stale —
 * strictly before Redis' own TTL, which is `ttl + grace` (see {@link armCacheWrite}) so the bytes
 * are still there to serve during the grace window.
 */
interface CachedResponse {
    status: number;
    body: unknown;
    staleAt: number;
}

/**
 * How long a shared cache (edge) or this server (origin) may keep serving a stale entry while one
 * rebuild is in flight — RFC 5861's `stale-while-revalidate`, and the same number both layers use
 * so they agree on what "stale" means. See docs/tools/redis-cache.md#refresh-ahead.
 */
const STALE_WHILE_REVALIDATE_SECONDS = 60;

/**
 * How long a shared cache may serve the last good copy instead of an error page during a 5xx or
 * an unreachable origin — RFC 5861's `stale-if-error`. Advertised only; nothing server-side reads
 * this, since an origin that is down cannot also be the one enforcing it.
 */
const STALE_IF_ERROR_SECONDS = 300;

/**
 * Longest TTL allowed outside production, in seconds — the bound on how long a write that bypassed
 * the API (a seed, a one-off script under `scripts/ops/`, a `mongosh` session) can keep serving a stale
 * answer. Production is never clamped, because there the API is the only writer.
 * `NODE_REDIS_CACHE_DEV_TTL_MAX=0` opts out.
 *
 * See: docs/tools/redis-cache.md#writes-that-bypass-the-api
 */
const getDevelopmentTtlMax = (): number => responseCacheConfig().NODE_REDIS_CACHE_DEV_TTL_MAX;

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

    const max = getDevelopmentTtlMax();
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
 * See: docs/tools/redis-cache.md#entry-size-is-bounded
 *
 * Serialized once, here, so the size check measures exactly what would be written rather than an
 * estimate of it. Skipping is not a failure: the caller still gets its response, it just will not
 * be replayed from cache, so the endpoint stays correct and only loses an optimisation.
 *
 * @param key - the cache key, for the log line
 * @param value - status + body envelope to replay on a later hit
 * @returns the bytes to store, or `undefined` when the response is over the limit
 */
const serializeCachedResponse = (key: string, value: CachedResponse): string | undefined => {
    const payload = JSON.stringify(value);
    const maxCachedBytes = responseCacheConfig().NODE_REDIS_CACHE_MAX_BYTES;
    if (Buffer.byteLength(payload) <= maxCachedBytes) return payload;

    // Logged rather than silent: an endpoint that never caches is worth noticing, and the
    // usual cause is a response that grew past what its page size was supposed to bound.
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
 * Whether a parsed value has the three fields `CachedResponse` requires.
 *
 * A stored entry can outlive the shape it was written under — a deploy that changes this
 * interface leaves old Redis entries in place — so a field-by-field check catches that, not just
 * "is it JSON".
 */
const isCachedResponse = (value: unknown): value is CachedResponse =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).status === 'number' &&
    typeof (value as Record<string, unknown>).staleAt === 'number' &&
    'body' in value;

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
 * Extra cache metadata for middleware users.
 */
interface CacheOptions {
    /** Invalidation tags this route's entries are cleared under — see {@link invalidateCache}. */
    tags?: string[];
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
     * Let the SERVER hold the answer for the full TTL, but make the browser check first.
     *
     * `invalidateCache` clears Redis on write but cannot reach a copy in someone's browser, so for
     * data a person edits and revisits, `max-age` is wrong. This keeps Redis serving while the
     * browser revalidates and gets `304` when the ETag matches — one round trip, edit visible at once.
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
     * See: docs/tools/redis-cache.md#no-caching-depends-on-who-is-asking
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
 * here keys on, and walking one is how a 100 kB body of `[[[…]]]` once threw a `RangeError` out
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
 * read, or the two disagree about which request this entry answers.
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
 * copy) — same reasoning as the `Vary: Authorization` note in `setCache` below. The raw query
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

    // Path only. `originalUrl` is the sole place the mounted prefix and the route path are
    // already joined, so it is split rather than reassembled from `baseUrl` + `path`.
    const [path] = request.originalUrl.split('?', 1);
    // A declared identity replaces BOTH halves of the default prefix, because the two spellings
    // it unifies differ in both — `GET /products` and `POST /products/search`.
    const identity = options.keyAs ?? `${request.method}:${path}`;
    // node:crypto SHA-256, hex: collision-safe for a cache identity, and the same digest whatever
    // the length of what went in. https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options
    // No parameters, no digest: the key stays readable for the many routes that declare none.
    const digest =
        segments.length > 0 ? createHash('sha256').update(segments.join('&')).digest('hex') : '';

    return `${identity}?${digest}:guest:${request.locale ?? '-'}`;
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
 *   `ttl + graceSeconds`, clamped by the caller to at most `ttl` (see {@link setCache})
 * @param tags - invalidation tags to pass to `setCacheValue`
 */
const armCacheWrite = (
    response: Response,
    cacheKey: string,
    ttl: number,
    graceSeconds: number,
    tags?: string[]
): void => {
    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        // Save only successful, FINISHED responses — errors must not become sticky in cache, and
        // 202 is a status about the request, not the resource: caching it would keep answering
        // "still working" long after the work finished, to every caller polling for the result.
        if (
            response.statusCode >= 200 &&
            response.statusCode < 300 &&
            response.statusCode !== 202
        ) {
            const payload = serializeCachedResponse(cacheKey, {
                status: response.statusCode,
                body,
                staleAt: Date.now() + ttl * 1000
            });
            if (payload !== undefined)
                void setCacheValue(cacheKey, payload, ttl + graceSeconds, tags);
        }

        return responseJson(body);
    }) as Response['json'];
};

/**
 * Set every cache-control header this middleware owns, and decide whether the request is even a
 * candidate for the Redis lookup {@link serveOrArm} does next. The two throws guard a mounting
 * mistake (`noStore` already set, or `browserRevalidate` on a POST), not a runtime condition —
 * see `docs/tools/redis-cache.md#response-headers` for the full reasoning behind every header set
 * here and the two throws.
 *
 * @param request - decides GET vs POST framing
 * @param response - headers are set on this response; `noStore` is read from it too
 * @param options - the route's declared cache identity — see {@link CacheOptions}
 * @param ttl - the resolved (possibly dev-clamped) TTL used to build `max-age`
 * @param cacheable - `options.scopeKey(request)`'s answer — see {@link CacheOptions.scopeKey}
 * @returns whether this request is a GET — reused by {@link serveOrArm}
 * @throws {Error} on either mounting mistake described above
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
    if (!cacheableRead && options.browserRevalidate)
        throw new Error(
            'browserRevalidate is GET-only: a POST response is not browser-cacheable, so ' +
                'there is nothing for the browser to revalidate. See the comment in this file.'
        );

    response.set(
        'Cache-Control',
        cacheableRead
            ? cacheable
                ? options.browserRevalidate
                    ? 'public, no-cache'
                    : `public, max-age=${ttl}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}, stale-if-error=${STALE_IF_ERROR_SECONDS}`
                : 'private, no-cache'
            : 'no-store'
    );
    response.vary('Authorization');
    response.vary('Accept-Language');

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

    // The grace window clamped to the resolved TTL: outside production `ttl` may already be
    // clamped to seconds (see resolveCacheTtl), and a fixed 60s grace would hand back most of
    // what that clamp just took — an out-of-band write could still serve a stale answer for
    // nearly a minute after it landed.
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
                    response.set('x-cache', 'MISS');
                    cacheRequestsTotal.inc({ result: 'miss' });
                    armCacheWrite(response, cacheKey, ttl, graceSeconds, options.tags);
                    next();
                    return;
                }

                // Fast path: still within the soft TTL.
                if (Date.now() < cachedResponse.staleAt) {
                    response.set('x-cache', 'HIT');
                    cacheRequestsTotal.inc({ result: 'hit' });
                    response.status(cachedResponse.status).json(cachedResponse.body);
                    return;
                }

                // Past the soft TTL: exactly one caller, across every worker and replica, rebuilds —
                // everyone else reads back their OWN key's stale body rather than wait. Nobody ever
                // receives the rebuilder's response object, so this cannot leak across callers —
                // every caller sharing this key already shares the same answer by construction,
                // per `options.scopeKey`'s own docblock.
                return claimCacheRefresh(cacheKey, graceSeconds).then((wonClaim) => {
                    if (!wonClaim) {
                        response.set('x-cache', 'STALE');
                        cacheRequestsTotal.inc({ result: 'stale' });
                        response.status(cachedResponse.status).json(cachedResponse.body);
                        return;
                    }

                    response.set('x-cache', 'REFRESH');
                    cacheRequestsTotal.inc({ result: 'refresh' });
                    armCacheWrite(response, cacheKey, ttl, graceSeconds, options.tags);
                    next();
                });
            })
            // A Redis failure here — `getCacheValue` or `claimCacheRefresh` rejecting — must not
            // hang the request: `next(error)` reaches the global handler exactly as an ordinary
            // thrown error would, rather than leaving neither a response nor a next() call ever
            // made.
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
    // Sorted once, at route-registration time rather than per request: the declaration is static,
    // and sorting it is what makes `?a=1&b=2` and `?b=2&a=1` one entry instead of two.
    const sortedKeyParameters = options.keyParameters.toSorted();

    return (request: Request, response: Response, next: NextFunction) => {
        // Outside production the TTL is clamped (see resolveCacheTtl) so writes that bypass the
        // API cannot leave stale answers around for an hour — resolved before the headers so
        // browsers are told the lifetime the server will actually honour.
        const ttl = resolveCacheTtl(seconds);
        // Resolved once, up front: both the headers and the Redis decision below must agree on
        // whether THIS caller may share the cached answer — see CacheOptions.scopeKey.
        const cacheable = options.scopeKey(request);
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
    seconds = 3600,
    keying: Pick<CacheOptions, 'keyValues' | 'orderedKeyParameters'> = {}
) =>
    setCache(seconds, {
        tags: [entity],
        keyParameters,
        keyAs: `${entity}:search`,
        scopeKey,
        ...keying
    });

/**
 * Clear Redis cache groups after successful write operations — e.g. after writing a product,
 * clear the `products` tag.
 *
 * One call covers every instance: the cached responses and tag sets live in shared Redis, so
 * deleting them here is visible to every other worker immediately.
 *
 * @param tags - the cache tags to clear, e.g. `['products']`
 * @returns an Express middleware to mount after the write it invalidates
 */
export const invalidateCache =
    (tags: string[]) => (_request: Request, response: Response, next: NextFunction) => {
        response.on('finish', () => {
            // Only clear cache after a successful write; failed writes should not wipe valid cache.
            if (response.statusCode < 200 || response.statusCode >= 300) return;

            void invalidateCacheTagsLogged(tags);
        });

        next();
    };

/**
 * Forbid every cache — browser, proxy, CDN — from storing the response at all. Mounted on the
 * account router, where every endpoint exchanges credentials or changes auth state.
 *
 * Prevents an intermittent silent logout: without it, a cached `GET /account/refresh` can
 * revalidate to a bodyless `304`, leaving the client with no access token but a valid refresh
 * cookie — so the UI shows signed-in. `no-store`, not `no-cache`, because `no-cache` still permits
 * storing and revalidating, which is exactly the 304 path that causes this.
 *
 * Marks `response.locals.noStore` for `setCache` above to check and refuse — see that guard.
 */
export const noStore = (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'no-store');
    response.locals.noStore = true;

    // `no-store` only stops a COMPLIANT client from revalidating. A non-compliant one sending
    // `If-None-Match` regardless would still get a 304 from Express' own freshness check —
    // dropping the conditional headers here means this endpoint can only answer a full body.
    delete request.headers['if-none-match'];
    delete request.headers['if-modified-since'];

    next();
};

/**
 * For a GET whose answer depends on who is asking (`orders`, `users`, `feedback`).
 *
 * Server:  never cached — RFC 9111 §3.5 rules out a shared cache storing an authenticated answer,
 *          and a per-caller key only grows the store for one caller's benefit.
 * Browser: may keep a private copy, unlike {@link noStore}, but must revalidate it first — cheap
 *          with Express's strong ETag (`app.set('etag', 'strong')`): `304` on no change.
 * Vary:    `Authorization`, as `setCache` sets it — an intermediary that ignores `private` must
 *          still learn the answer depends on who asked.
 */
export const privateNoCache = (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'private, no-cache');
    response.vary('Authorization');
    response.vary('Accept-Language');
    next();
};
