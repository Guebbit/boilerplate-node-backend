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

import type { NextFunction, Request, Response } from 'express';
import { getCacheValue, invalidateCacheTags, setCacheValue } from '@infrastructure/adapters/cache';
import { logger } from '@infrastructure/adapters/logger';
import { cacheInvalidationFailuresTotal } from '@infrastructure/observability/metrics-cache';
import { environmentNumber } from '@infrastructure/runtime/environment';

/** Enough to replay an HTTP response verbatim: the status code and the serialized body. */
interface CachedResponse {
    status: number;
    body: unknown;
}

/**
 * Longest TTL allowed outside production, in seconds — the bound on how long a write that bypassed
 * the API (a seed, a migration, a `mongosh` session) can keep serving a stale answer. Production is
 * never clamped, because there the API is the only writer. `NODE_REDIS_CACHE_DEV_TTL_MAX=0` opts
 * out.
 *
 * See: docs/tools/redis-cache.md#writes-that-bypass-the-api
 */
const DEFAULT_DEV_TTL_MAX_SECONDS = 30;

const getDevelopmentTtlMax = (): number => {
    const raw = process.env.NODE_REDIS_CACHE_DEV_TTL_MAX;
    if (raw === undefined || raw.trim() === '') return DEFAULT_DEV_TTL_MAX_SECONDS;

    const parsed = Number(raw);
    // A non-numeric or negative value is a config typo; fall back rather than cache forever.
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEV_TTL_MAX_SECONDS;
};

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
    if (process.env.NODE_ENV === 'production') return seconds;

    const max = getDevelopmentTtlMax();
    if (max <= 0) return seconds;
    return Math.min(seconds, max);
};

/**
 * Largest response body this cache will store, in bytes.
 *
 * A cache turns a cheap request into long-lived server state: the key includes the full URL, so an
 * unauthenticated caller can mint an entry per query string and keep every one resident. Bounding
 * the ENTRY is what stops that being an amplifier.
 *
 * See: docs/tools/redis-cache.md#entry-size-is-bounded
 */
const DEFAULT_MAX_CACHED_BYTES = 256 * 1024;

const getMaxCachedBytes = (): number =>
    environmentNumber('NODE_REDIS_CACHE_MAX_BYTES', DEFAULT_MAX_CACHED_BYTES, 1);

/**
 * Serialize a response for storage, or refuse it for being too large.
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
    const maxCachedBytes = getMaxCachedBytes();
    if (Buffer.byteLength(payload) <= maxCachedBytes) return payload;

    // Logged rather than silent: an endpoint that never caches is worth noticing, and the
    // usual cause is a response that grew past what its page size was supposed to bound.
    logger.warn({
        message: 'Redis cache write skipped: response larger than the per-entry limit.',
        key,
        bytes: Buffer.byteLength(payload),
        maxCachedBytes
    });
    return undefined;
};

/**
 * Read one stored envelope back.
 *
 * A corrupt value — half-written, hand-edited — degrades to a cache miss. If the parse failure
 * escaped, one bad key would turn a working endpoint into a 500 until someone deleted it by hand.
 *
 * @param raw - the bytes `getCacheValue` returned
 * @returns the envelope, or `undefined` when it cannot be read
 */
const parseCachedResponse = (raw: string): CachedResponse | undefined => {
    // eslint-disable-next-line no-restricted-syntax -- JSON.parse has no non-throwing form; a corrupt entry is a miss, not a 500
    try {
        return JSON.parse(raw) as CachedResponse;
    } catch {
        return undefined;
    }
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
     * The cache identity two spellings of ONE question share.
     *
     * Default key starts with `METHOD:path`. Wrong for the four searches, where `GET
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
}

/**
 * Keep cache entries separated by user.
 * This avoids serving one user's private data to another user.
 */
const getCacheScope = (request: Request) => {
    const userId = request.authContext?.id;
    if (!userId) return 'guest';
    return `user:${userId}`;
};

/**
 * One spelling of a value, whichever transport carried it.
 *
 * A query string has no types (`?page=1` is the string `'1'`) while a JSON body keeps its own, so
 * stringifying scalars is what lets `{page: 1}` and `?page=1` share one cache entry. Not
 * validation — an unrecognisable value just keys on its own spelling and reaches the controller.
 */
const normalizeKeyValue = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(String) : String(value);

/**
 * Build one cache key from method + path + the declared query parameters + user scope + language.
 *
 * Locale is in the key because it changes the body (translated copy) — same reasoning as the
 * `Vary: Authorization` note in `setCache` below. The raw query string is deliberately NOT part of
 * the key: query-string order is not stable across clients, and only `keyParameters` —
 * pre-sorted, JSON-serialized — can reach the key, so `?anything=else` cannot mint its own entry.
 */
const getCacheKey = (request: Request, sortedKeyParameters: readonly string[], keyAs?: string) => {
    // Path only. `originalUrl` is the sole place the mounted prefix and the route path are
    // already joined, so it is split rather than reassembled from `baseUrl` + `path`.
    const [path] = request.originalUrl.split('?');
    // A declared identity replaces BOTH halves of the default prefix, because the two spellings
    // it unifies differ in both — `GET /products` and `POST /products/search`.
    const identity = keyAs ?? `${request.method}:${path}`;
    // Express 5 leaves `body` undefined when the request carries none, which every GET does.
    const body = (request.body ?? {}) as Record<string, unknown>;
    // `Object.hasOwn`, not `in`: the latter walks the prototype chain, so a parameter named
    // `toString` would count as present on every request.
    //
    // Body BEFORE query, which is the `search` surface's own precedence — the key has to be built
    // from the same value the controller will read, or the two disagree about which request this
    // entry answers.
    const values = sortedKeyParameters
        .filter((name) => Object.hasOwn(body, name) || Object.hasOwn(request.query, name))
        .map((name) => {
            const raw = Object.hasOwn(body, name) ? body[name] : request.query[name];
            return `${name}=${JSON.stringify(normalizeKeyValue(raw))}`;
        })
        .join('&');

    return `${identity}?${values}:${getCacheScope(request)}:${request.locale ?? '-'}`;
};

/**
 * Make a cache-MISS response write itself to Redis as it is sent.
 *
 * Wraps `response.json` rather than hooking `finish`: `json` is the one place that already has the
 * parsed body in hand, so nothing has to re-derive it from the wire bytes later.
 *
 * @param response - the response whose `json` method is being overridden
 * @param cacheKey - key this response will be stored under, on success
 * @param ttl - TTL to pass to `setCacheValue`
 * @param tags - invalidation tags to pass to `setCacheValue`
 */
const armCacheWrite = (
    response: Response,
    cacheKey: string,
    ttl: number,
    tags?: string[]
): void => {
    const responseJson = response.json.bind(response);
    response.json = ((body: unknown) => {
        // Save only successful responses, so errors do not become sticky in cache.
        if (response.statusCode >= 200 && response.statusCode < 300) {
            const payload = serializeCachedResponse(cacheKey, {
                status: response.statusCode,
                body
            });
            if (payload !== undefined) void setCacheValue(cacheKey, payload, ttl, tags);
        }

        return responseJson(body);
    }) as Response['json'];
};

/**
 * Cache GET responses in Redis: serve a stored envelope on a hit, or run the controller and let
 * {@link armCacheWrite} store what it answers.
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
        // `noStore` already forbade caching on this response. Left unchecked, `response.set`
        // below would REPLACE that header rather than merge — exactly how `GET /account` once
        // cached a caller's profile for an hour behind a router-wide no-store mount. Failing
        // here means the two middlewares can never again disagree on the wire.
        if (response.locals.noStore)
            throw new Error(
                'setCache mounted on a route noStore already marked no-store. A route is either ' +
                    'cacheable or it is not — remove one of the two. See the comment on noStore ' +
                    'in this file.'
            );

        // Outside production the TTL is clamped (see resolveCacheTtl) so writes that bypass the
        // API cannot leave stale answers around for an hour — resolved before the header so
        // browsers are told the lifetime the server will actually honour.
        const ttl = resolveCacheTtl(seconds);

        /*
         * A cached POST is a SERVER-side arrangement only. `POST /x/search` is a read wearing a
         * write's method, and Redis can key it from the declared allowlist below — but a browser
         * or proxy cannot: RFC 9110 makes a POST response cacheable only under conditions nothing
         * here meets, and a shared cache holding one could answer a LATER POST from it, including
         * a real write on some other route. So the wire says `no-store` while the server caches
         * anyway. `browserRevalidate` is refused here for the same reason: a route asking for both
         * has a design error, not a header to tune.
         */
        const cacheableRead = request.method === 'GET';
        if (!cacheableRead && options.browserRevalidate)
            throw new Error(
                'browserRevalidate is GET-only: a POST response is not browser-cacheable, so ' +
                    'there is nothing for the browser to revalidate. See the comment in this file.'
            );

        // Keep browser/proxy cache headers aligned with the server-side Redis cache policy —
        // unless the route asked for revalidation, which decouples the two on purpose.
        const scope = request.authContext ? 'private' : 'public';
        response.set(
            'Cache-Control',
            cacheableRead
                ? options.browserRevalidate
                    ? `${scope}, no-cache`
                    : `${scope}, max-age=${ttl}`
                : 'no-store'
        );

        // `Vary: Authorization` is the one header that decides the body: `getAuth` derives
        // `authContext` from `Authorization` alone, never a cookie, so without this an anonymous
        // response cached by a shared cache could be served back to an admin requesting the same
        // URL — same failure as `GET /account` serving one user's profile to the next.
        // `response.vary` appends, so CORS's `Vary: Origin` survives; an authenticated response
        // keys on a rotating bearer token and so is effectively uncacheable, which is the point.
        response.vary('Authorization');

        // Same argument, second header: `attachLocale` already sets `Vary: Accept-Language`, and
        // it is repeated here so a route reaching `setCache` by another path still declares it.
        response.vary('Accept-Language');

        /*
         * POST is served from Redis only when the route declared `keyAs` — the same declaration
         * that unifies it with its GET twin. Without it a POST would key on `POST:/x/search` and
         * quietly cache whatever the next POST route to mount `setCache` happened to be,
         * including a write.
         */
        const servedFromCache = cacheableRead || options.keyAs !== undefined;
        if (!servedFromCache || ttl <= 0) {
            next();
            return;
        }

        const cacheKey = getCacheKey(request, sortedKeyParameters, options.keyAs);
        return getCacheValue(cacheKey).then((raw) => {
            const cachedResponse = raw === undefined ? undefined : parseCachedResponse(raw);

            // Fast path: Redis already has a response for this exact request.
            if (cachedResponse) {
                response.set('x-cache', 'HIT');
                response.status(cachedResponse.status).json(cachedResponse.body);
                return;
            }

            response.set('x-cache', 'MISS');
            armCacheWrite(response, cacheKey, ttl, options.tags);

            // No cache hit, so continue to the controller and let it generate a fresh response.
            next();
        });
    };
};

/**
 * `setCache` for a module's two search spellings — `GET /x` and `POST /x/search` — which must
 * share one `keyAs` identity (see the note on it above) so that whichever spelling asks first
 * warms the other. Every module wired the same three fields onto both routes by hand; this is
 * that declaration, made once and reused, so the two routes cannot drift apart into two keys.
 *
 * @param entity - the module's cache tag, and half of its `keyAs` — `'products'` → `products:search`
 * @param keyParameters - the module's own schema-derived key parameters
 * @param seconds - TTL; defaults to the hour every search endpoint but `feedback` uses
 */
export const searchCache = (entity: string, keyParameters: readonly string[], seconds = 3600) =>
    setCache(seconds, { tags: [entity], keyParameters, keyAs: `${entity}:search` });

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

            void invalidateCacheTags(tags).then(({ reachable }) => {
                if (reachable) return;
                /*
                 * The write landed but its cached predecessor did not, so this endpoint serves a
                 * stale response until the TTL expires. The response is already sent, so logging
                 * plus a counter — reachable from an alert, not just grep — is the only move left.
                 */
                for (const tag of tags) cacheInvalidationFailuresTotal.inc({ tag });
                logger.error({
                    message: 'Cache invalidation could not reach Redis; stale responses survive.',
                    tags
                });
            });
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
