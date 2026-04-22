import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { getRouteLabel, recordRequestMetric } from '@utils/observability';
import type { IRequestContext } from '@nest/types/request-context';
import type { FastifyReply } from 'fastify';

/**
 * Record per-request metrics after response completion.
 */
@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<IRequestContext>();
        const response = context.switchToHttp().getResponse<FastifyReply>();
        const startTime = process.hrtime.bigint();

        return next.handle().pipe(
            tap(() => {
                const elapsedTimeInMilliseconds = Number(process.hrtime.bigint() - startTime) / 1_000_000;
                recordRequestMetric({
                    method: request.method,
                    route: getRouteLabel(request),
                    statusCode: response.statusCode,
                    durationMs: elapsedTimeInMilliseconds
                });
            })
        );
    }
}
