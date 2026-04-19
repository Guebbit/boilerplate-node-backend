import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { getCacheValue, invalidateCacheTags, setCacheValue } from './cache';

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
    const userId = request.user?._id;
    if (!userId) return 'guest';
    return `user:${userId instanceof Types.ObjectId ? userId.toString() : String(userId)}`;
};

/**
 * Build one cache key from method + URL + user scope.
 */
const getCacheKey = (request: Request) =>
    `${request.method}:${request.originalUrl}:${getCacheScope(request)}`;

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
        // Keep browser/proxy cache headers aligned with the server-side Redis cache policy.
        response.set(
            'Cache-Control',
            `${request.user ? 'private' : 'public'}, max-age=${seconds}`
        );

        if (request.method !== 'GET' || seconds <= 0) {
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
                        seconds,
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
                void invalidateCacheTags(tags);
        });

        next();
    };
