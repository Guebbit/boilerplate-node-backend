import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { invalidateCacheTags } from '@utils/cache';
import { INVALIDATE_CACHE_METADATA_KEY } from '@nest/constants';
import type { FastifyReply } from 'fastify';

/**
 * Invalidate cache tags for successful write operations.
 */
@Injectable()
export class InvalidateCacheInterceptor implements NestInterceptor {
    constructor(private readonly reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const invalidateConfig = this.reflector.get<{ tags: string[] }>(
            INVALIDATE_CACHE_METADATA_KEY,
            context.getHandler()
        );

        if (!invalidateConfig?.tags?.length) return next.handle();

        const response = context.switchToHttp().getResponse<FastifyReply>();

        return next.handle().pipe(
            tap(() => {
                if (response.statusCode >= 200 && response.statusCode < 300)
                    void invalidateCacheTags(invalidateConfig.tags);
            })
        );
    }
}
