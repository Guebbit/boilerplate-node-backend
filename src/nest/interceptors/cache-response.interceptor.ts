import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EMPTY, Observable, tap } from 'rxjs';
import type { FastifyReply } from 'fastify';
import { getCacheValue, setCacheValue } from '@utils/cache';
import { CACHEABLE_METADATA_KEY } from '@nest/constants';
import type { IRequestContext } from '@nest/types/request-context';
import { Types } from 'mongoose';

/**
 * Route-level Redis cache interceptor for GET responses.
 */
@Injectable()
export class CacheResponseInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    /**
     * Normalize request user identity to one stable cache scope value.
     */
    private getRequestScope(request: IRequestContext): string {
        const userId = request.user?._id;
        if (!userId) return 'guest';
        return `user:${userId instanceof Types.ObjectId ? userId.toString() : String(userId)}`;
    }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
        const cacheConfig = this.reflector.get<{ seconds: number; tags: string[] }>(
            CACHEABLE_METADATA_KEY,
            context.getHandler()
        );

        if (!cacheConfig || cacheConfig.seconds <= 0) return next.handle();

        const request = context.switchToHttp().getRequest<IRequestContext>();
        const response = context.switchToHttp().getResponse<FastifyReply>();

        if (request.method !== 'GET') return next.handle();

        const requestPath = request.url.split('?')[0] ?? request.url;
        const cacheKey = `${request.method}:${requestPath}:${this.getRequestScope(request)}`;

        response.header(
            'Cache-Control',
            `${request.user ? 'private' : 'public'}, max-age=${cacheConfig.seconds}`
        );

        const cachedResponse = await getCacheValue(cacheKey);
        if (cachedResponse) {
            response.header('x-cache', 'HIT');
            response.status(cachedResponse.status).send(cachedResponse.body);
            return EMPTY;
        }

        response.header('x-cache', 'MISS');

        return next.handle().pipe(
            tap((body) => {
                if (response.statusCode >= 200 && response.statusCode < 300)
                    void setCacheValue(
                        cacheKey,
                        { status: response.statusCode, body },
                        cacheConfig.seconds,
                        cacheConfig.tags
                    );
            })
        );
    }
}
