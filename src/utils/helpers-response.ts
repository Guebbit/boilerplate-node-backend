import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { getCacheValue, invalidateCacheTags, setCacheValue } from './cache';

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
    async (request: Request, response: Response, next: NextFunction) => {
        response.set(
            'Cache-Control',
            `${request.user ? 'private' : 'public'}, max-age=${seconds}`
        );

        if (request.method !== 'GET' || seconds <= 0) {
            next();
            return;
        }

        const cacheKey = getCacheKey(request);
        const cachedResponse = await getCacheValue(cacheKey);

        if (cachedResponse) {
            response.set('x-cache', 'HIT');
            response.status(cachedResponse.status).json(cachedResponse.body);
            return;
        }

        response.set('x-cache', 'MISS');

        const responseJson = response.json.bind(response);
        response.json = ((body: unknown) => {
            // Save only successful responses.
            if (response.statusCode >= 200 && response.statusCode < 300)
                void setCacheValue(cacheKey, { status: response.statusCode, body }, seconds, options.tags);

            return responseJson(body);
        }) as Response['json'];

        next();
    };

/**
 * Clear Redis cache groups after successful write operations.
 * Example: after creating/updating/deleting a product, clear "products" cache.
 */
export const invalidateCache =
    (tags: string[]) => (_request: Request, response: Response, next: NextFunction) => {
        response.on('finish', () => {
            if (response.statusCode >= 200 && response.statusCode < 300)
                void invalidateCacheTags(tags);
        });

        next();
    };
