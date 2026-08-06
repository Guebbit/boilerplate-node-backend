import type { NextFunction, Request, Response } from 'express';
import {
    getCacheValue,
    invalidateCacheTags,
    setCacheValue,
    broadcastCacheInvalidation,
    resolveCacheTtl
} from '@core/adapters/cache';

/**
 * Extra cache metadata for middleware users.
 */
type CacheOptions = {
    tags?: string[];
};

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
 * Build one cache key from method + URL + user scope + language.
 *
 * The locale belongs in the key for the same reason the user does: it changes the body. Bodies
 * carry translated `message` / `errors` copy, so an Italian response stored under a locale-blind
 * key is served verbatim to the next English caller of the same URL. `request.locale` is set by
 * the locale middleware, which is mounted before the routes; the fallback keeps this usable in
 * unit tests that exercise the cache middleware in isolation.
 */
const getCacheKey = (request: Request) =>
    `${request.method}:${request.originalUrl}:${getCacheScope(request)}:${request.locale ?? '-'}`;

/**
 * Cache GET responses in Redis.
 * Quick flow:
 * 1) try Redis
 * 2) if HIT, return cached JSON
 * 3) if MISS, run controller and save the fresh response
 *
 * @param seconds
 */
export const setCache =
    (seconds = 0, options: CacheOptions = {}) =>
    (request: Request, response: Response, next: NextFunction) => {
        // Outside production the declared TTL is clamped (see resolveCacheTtl), so that writes
        // which bypass the API — db:seed, migrations, mongosh — cannot leave stale answers
        // around for an hour. Resolved here, before the header, so browsers are told the
        // lifetime the server will actually honour.
        const ttl = resolveCacheTtl(seconds);

        // Keep browser/proxy cache headers aligned with the server-side Redis cache policy.
        response.set(
            'Cache-Control',
            `${request.authContext ? 'private' : 'public'}, max-age=${ttl}`
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

        const cacheKey = getCacheKey(request);
        return getCacheValue(cacheKey).then((cachedResponse) => {
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
                if (response.statusCode >= 200 && response.statusCode < 300)
                    void setCacheValue(
                        cacheKey,
                        { status: response.statusCode, body },
                        ttl,
                        options.tags
                    );

                return responseJson(body);
            }) as Response['json'];

            // No cache hit, so continue to the controller and let it generate a fresh response.
            next();
        });
    };

/**
 * Clear Redis cache groups after successful write operations.
 * Example: after creating/updating/deleting a product, clear "products" cache.
 */
export const invalidateCache =
    (tags: string[]) => (_request: Request, response: Response, next: NextFunction) => {
        response.on('finish', () => {
            // Only clear cache after a successful write; failed writes should not wipe valid cache.
            if (response.statusCode >= 200 && response.statusCode < 300)
                void invalidateCacheTags(tags).then(() => broadcastCacheInvalidation(tags));
        });

        next();
    };

/**
 * Forbid every cache — browser, proxy, CDN — from storing the response at all.
 *
 * Mounted on the account router, because every endpoint there either exchanges credentials or
 * changes auth state, and none of them is safe to keep a copy of.
 *
 * It fixes a real, intermittent logout. Express attaches an `ETag` to responses automatically,
 * and `GET /account/refresh` declared no cache policy — so the browser applied heuristic caching,
 * stored the response, and revalidated later with `If-None-Match`. Express then answered
 * `304 Not Modified`, which by definition carries NO BODY. That endpoint's entire purpose is to
 * return a freshly minted access token *in the body*, so the client received nothing, left its
 * in-memory token undefined, and issued every subsequent request unauthenticated — while still
 * holding a valid refresh cookie, so the UI went on showing the user as signed in. An admin got
 * the anonymous product list under an admin header.
 *
 * It was intermittent because a JWT embeds its issued-at second: two refreshes inside the same
 * second produce byte-identical bodies, hence the same ETag, hence the 304. Different seconds
 * produce a fresh 200. That is why the frontend's live e2e suite failed on timing rather than on
 * anything it asserted.
 *
 * `no-store`, not `no-cache`: despite the name, `no-cache` permits storing and merely requires
 * revalidation — which is exactly the 304 path that causes this. RFC 9111 §5.2.2.5 defines
 * `no-store` as "a cache MUST NOT store any part of either the immediate request or the
 * response", which is the guarantee needed here. The older `Pragma: no-cache` / `Expires: 0`
 * companions are not added: they exist for HTTP/1.0 caches and RFC 9111 §5.4 deprecates `Pragma`.
 *
 * Runs before the route handlers, so a route that genuinely wants caching can still override it
 * by applying `setCache` afterwards — as `GET /account` does.
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
