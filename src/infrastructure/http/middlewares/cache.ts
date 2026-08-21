/**
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
    Number(process.env.NODE_REDIS_CACHE_MAX_BYTES) || DEFAULT_MAX_CACHED_BYTES;

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
    tags?: string[];
    /**
     * The query parameters this endpoint's answer actually depends on.
     *
     * Required, and deliberately so: it is the statement that decides which requests share a
     * cached response, and getting it wrong is a correctness bug, not a missed optimisation.
     * Most endpoints declare `[]` — a path-only route has no query parameter that changes
     * anything. The search controllers derive theirs from the same Zod schema they validate
     * against, so the list cannot drift from what the controller reads.
     */
    keyParameters: readonly string[];

    /**
     * Let the SERVER hold the answer for the full TTL, but make the browser check first.
     *
     * `invalidateCache` clears Redis on every write and cannot reach a copy already in someone's
     * browser — so for data a PERSON edits and then goes looking at, `max-age` is wrong. Set this
     * and the response is still served from Redis; the browser revalidates and Express answers
     * `304` whenever the ETag matches. One round trip, for an edit that appears at once.
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
 * Build one cache key from method + path + the declared query parameters + user scope + language.
 *
 * The locale belongs in the key for the same reason the user does: it changes the body. Bodies
 * carry translated `message` / `errors` copy, so an Italian response stored under a locale-blind
 * key is served verbatim to the next English caller of the same URL. `request.locale` is set by
 * the locale middleware, which is mounted before the routes; the fallback keeps this usable in
 * unit tests that exercise the cache middleware in isolation.
 *
 * The raw query string is deliberately NOT part of the key. Keying off `request.originalUrl` would
 * make the key depend on how a URL was *written* rather than on what it asked for:
 *
 *   - `?page=1&pageSize=10` and `?pageSize=10&page=1` are the same request. Query-string order is
 *     not stable across HTTP clients, so each spelling is a live cache miss and a second identical
 *     Mongo query behind it.
 *   - `?anything=else` is stripped by the controllers' validators and changes no answer, yet would
 *     mint its own hour-long entry.
 *
 * `keyParameters` is pre-sorted at route-registration time, and a parameter nobody declared cannot
 * reach the key. A parameter is included only when the request actually carries it, and its value
 * is JSON-serialized so a repeated key (`?tag=a&tag=b`, which arrives as an array) stays
 * distinguishable from a single one.
 */
const getCacheKey = (request: Request, sortedKeyParameters: readonly string[]) => {
    // Path only. `originalUrl` is the sole place the mounted prefix and the route path are
    // already joined, so it is split rather than reassembled from `baseUrl` + `path`.
    const [path] = request.originalUrl.split('?');
    // `Object.hasOwn`, not `in`: the latter walks the prototype chain, so a parameter named
    // `toString` would count as present on every request.
    const query = sortedKeyParameters
        .filter((name) => Object.hasOwn(request.query, name))
        .map((name) => `${name}=${JSON.stringify(request.query[name])}`)
        .join('&');

    return `${request.method}:${path}?${query}:${getCacheScope(request)}:${request.locale ?? '-'}`;
};

/**
 * Cache GET responses in Redis.
 * Quick flow:
 * 1) try Redis
 * 2) if HIT, return cached JSON
 * 3) if MISS, run controller and save the fresh response
 *
 * @param seconds
 */
export const setCache = (seconds = 0, options: CacheOptions) => {
    // Sorted once, at route-registration time rather than per request: the declaration is static,
    // and sorting it is what makes `?a=1&b=2` and `?b=2&a=1` one entry instead of two.
    const sortedKeyParameters = options.keyParameters.toSorted();

    return (request: Request, response: Response, next: NextFunction) => {
        // Outside production the declared TTL is clamped (see resolveCacheTtl), so that writes
        // which bypass the API — db:seed, migrations, mongosh — cannot leave stale answers
        // around for an hour. Resolved here, before the header, so browsers are told the
        // lifetime the server will actually honour.
        const ttl = resolveCacheTtl(seconds);

        // Keep browser/proxy cache headers aligned with the server-side Redis cache policy —
        // unless the route asked for revalidation, which decouples the two on purpose.
        const scope = request.authContext ? 'private' : 'public';
        response.set(
            'Cache-Control',
            options.browserRevalidate ? `${scope}, no-cache` : `${scope}, max-age=${ttl}`
        );

        // The Redis key is scoped by user (see getCacheScope), but a cache in front of the API
        // keys on method + URL + the headers named in `Vary` — and nothing here named the one
        // header that decides the body. `getAuth` derives `authContext` from `Authorization`
        // alone, never from a cookie, so that header is the entire scope key.
        //
        // Without it: an anonymous `GET /products?page=1&pageSize=10` answers `public,
        // max-age=30` with the 3 publicly visible products, and the browser stores it. An admin
        // asking for the same URL seconds later matches that entry — same URL, same `Vary:
        // Origin` — so the browser answers from its own store and the request never reaches the
        // API. The admin gets the anonymous list under an admin header, with Edit/Delete on
        // every row, and nothing refetches. Same mechanism on `GET /account`: one user's profile
        // served to the next, flipping `isAdmin` and sending route guards the wrong way.
        //
        // `response.vary` appends, so the `Vary: Origin` that CORS sets is preserved. An
        // authenticated response keys on a rotating bearer token and so is effectively
        // uncacheable in the browser; that is the point. Anonymous traffic — the volume worth
        // caching — still shares one entry.
        response.vary('Authorization');

        // Same argument, second header: `attachLocale` already sets `Vary: Accept-Language` on
        // every response, and it is repeated here so a route that reaches `setCache` by some
        // other path still declares it. `vary` de-duplicates.
        response.vary('Accept-Language');

        if (request.method !== 'GET' || ttl <= 0) {
            next();
            return;
        }

        const cacheKey = getCacheKey(request, sortedKeyParameters);
        return getCacheValue(cacheKey).then((raw) => {
            const cachedResponse = raw === undefined ? undefined : parseCachedResponse(raw);

            // Fast path: Redis already has a response for this exact request.
            if (cachedResponse) {
                response.set('x-cache', 'HIT');
                response.status(cachedResponse.status).json(cachedResponse.body);
                return;
            }

            response.set('x-cache', 'MISS');

            const responseJson = response.json.bind(response);
            response.json = ((body: unknown) => {
                // Save only successful responses, so errors do not become sticky in cache.
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    const payload = serializeCachedResponse(cacheKey, {
                        status: response.statusCode,
                        body
                    });
                    if (payload !== undefined)
                        void setCacheValue(cacheKey, payload, ttl, options.tags);
                }

                return responseJson(body);
            }) as Response['json'];

            // No cache hit, so continue to the controller and let it generate a fresh response.
            next();
        });
    };
};

/**
 * Clear Redis cache groups after successful write operations.
 * Example: after creating/updating/deleting a product, clear "products" cache.
 *
 * One call covers every app instance: the cached responses and the tag sets live in shared
 * Redis, so deleting them here is immediately visible to every other worker. No cross-instance
 * broadcast is involved — there is no process-local cache tier for one to invalidate.
 */
export const invalidateCache =
    (tags: string[]) => (_request: Request, response: Response, next: NextFunction) => {
        response.on('finish', () => {
            // Only clear cache after a successful write; failed writes should not wipe valid cache.
            if (response.statusCode < 200 || response.statusCode >= 300) return;

            void invalidateCacheTags(tags).then(({ reachable }) => {
                if (reachable) return;
                /*
                 * The write landed and its cached predecessor did not go with it, so this endpoint
                 * serves a stale response until the TTL expires. The response is already sent —
                 * recording it is the only move left, and `error` plus a counter is what makes it
                 * reachable from an alert rather than from someone grepping.
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
 * Forbid every cache — browser, proxy, CDN — from storing the response at all.
 *
 * Mounted on the account router: every endpoint there exchanges credentials or changes auth state.
 *
 * It prevents an intermittent silent logout. Express attaches an `ETag`, so a cached
 * `GET /account/refresh` revalidates and gets `304 Not Modified` — which carries no body, and the
 * body is the whole point: the client ends up with no access token while still holding a valid
 * refresh cookie, so the UI shows it as signed in. Intermittent because a JWT embeds its issued-at
 * second, so two refreshes in the same second produce the same ETag.
 *
 * `no-store`, not `no-cache`: `no-cache` permits storing and merely requires revalidation, which
 * is the 304 path itself (RFC 9111 §5.2.2.5). `Pragma`/`Expires` are omitted — HTTP/1.0 only, and
 * §5.4 deprecates `Pragma`.
 *
 * Runs before the route handlers, so a route wanting caching overrides it with `setCache` — as
 * `GET /account` does.
 */
export const noStore = (request: Request, response: Response, next: NextFunction) => {
    response.set('Cache-Control', 'no-store');

    // `no-store` stops a COMPLIANT client from keeping a copy, so it never revalidates — which
    // covers browsers. It does not stop a request that sends `If-None-Match` regardless (an
    // intermediary, a non-compliant client, a hand-rolled fetch), because Express answers those
    // from its own freshness check and still replies 304. Dropping the conditional headers on
    // the way in means this endpoint cannot answer anything but a full body, whoever asks.
    delete request.headers['if-none-match'];
    delete request.headers['if-modified-since'];

    next();
};
