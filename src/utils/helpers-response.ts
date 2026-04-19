import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { getCacheValue, invalidateCacheTags, setCacheValue } from './cache';

type CacheOptions = {
    tags?: string[];
};

const getCacheScope = (request: Request) => {
    const userId = request.user?._id;
    if (!userId) return 'guest';
    return `user:${userId instanceof Types.ObjectId ? userId.toString() : String(userId)}`;
};

const getCacheKey = (request: Request) =>
    `${request.method}:${request.originalUrl}:${getCacheScope(request)}`;

/**
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
            if (response.statusCode >= 200 && response.statusCode < 300)
                void setCacheValue(cacheKey, { status: response.statusCode, body }, seconds, options.tags);

            return responseJson(body);
        }) as Response['json'];

        next();
    };

export const invalidateCache =
    (tags: string[]) => (_request: Request, response: Response, next: NextFunction) => {
        response.on('finish', () => {
            if (response.statusCode >= 200 && response.statusCode < 300)
                void invalidateCacheTags(tags);
        });

        next();
    };
