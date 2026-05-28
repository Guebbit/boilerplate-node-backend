import type { Request, Response, NextFunction } from 'express';
import { emitAuditEvent } from '@utils/audit';
import { emitAnalyticsEvent } from '@utils/analytics';
import { logger } from '@utils/winston';
import type { IRequestDeps } from '../types/request-deps';

/**
 * Middleware that attaches real cross-cutting dependencies to the request.
 * Controllers can use request.deps.* instead of direct imports,
 * making them trivially testable by swapping this middleware with stubs.
 */
export const attachDeps = (request: Request, _response: Response, next: NextFunction): void => {
    const deps: IRequestDeps = {
        emitAudit: emitAuditEvent,
        emitAnalytics: emitAnalyticsEvent,
        log: {
            info: (message: string, meta?: Record<string, unknown>) => logger.info(message, meta),
            warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, meta),
            error: (message: string, meta?: Record<string, unknown>) => logger.error(message, meta)
        }
    };
    request.deps = deps;
    next();
};
