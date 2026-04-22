import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import crypto from 'node:crypto';
import { createTraceContext, toTraceparentHeader } from '@utils/observability';
import { logger } from '@utils/winston';
import type { IRequestContext } from '@nest/types/request-context';
import type { FastifyReply } from 'fastify';

/**
 * Attach correlation identifiers and trace headers for every request.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<IRequestContext>();
        const response = context.switchToHttp().getResponse<FastifyReply>();

        const requestId = request.headers['x-request-id']?.toString() ?? crypto.randomUUID();
        request.requestId = requestId;
        response.header('x-request-id', requestId);

        const traceContext = createTraceContext(request.headers.traceparent?.toString());
        request.traceContext = traceContext;
        response.header('traceparent', toTraceparentHeader(traceContext));
        response.header('x-trace-id', traceContext.traceId);

        logger.info({
            requestId,
            traceId: traceContext.traceId,
            spanId: traceContext.spanId,
            parentSpanId: traceContext.parentSpanId,
            method: request.method,
            url: `${request.protocol}://${request.hostname}${request.url}`
        });

        return next.handle();
    }
}
