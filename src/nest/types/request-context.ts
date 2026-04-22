import type { FastifyRequest } from 'fastify';
import type { IUserDocument } from '@models/users';
import type { ITraceContext } from '@utils/observability';

/**
 * Request shape used across Nest controllers/guards.
 *
 * We keep custom request metadata here (user/requestId/traceContext)
 * so all framework-native pieces can share one typed contract.
 */
export interface IRequestContext extends FastifyRequest {
    user?: IUserDocument;
    requestId?: string;
    traceContext?: ITraceContext;
}
