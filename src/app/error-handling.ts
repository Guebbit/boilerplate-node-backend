/**
 * The global error handler, and the process-level handlers behind it.
 *
 * Grouped because both answer the same question — what happens to a failure nobody else handled —
 * at the two levels it can be asked: inside a request, and outside one.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { logger, auditLogger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { ExtendedError, databaseErrorInterpreter } from '@infrastructure/http/errors';
import {
    getActiveSpanContext,
    recordErrorOnActiveSpan
} from '@infrastructure/observability/tracer';
import { t } from '@infrastructure/i18n';

/**
 * Global error handler — log once, stack in OTel span.
 *
 * Exported so it can be driven directly. Mounted last, after the 404 catch-all, which is what an
 * error handler has to be and also what makes it unreachable from a route registered afterwards
 * — so a test cannot get at it by adding a throwing route to `app`.
 */
export const handleUncaughtError = (
    error: Error,
    request: Request,
    response: Response,
    _next: NextFunction
) => {
    if (response.headersSent) return;

    recordErrorOnActiveSpan(error);

    const status =
        error instanceof MulterError ? 400 : error instanceof ExtendedError ? error.httpCode : 500;

    logger.error(`${error.name}: ${error.message}`, {
        request_id: request.requestId,
        trace_id: getActiveSpanContext().traceId,
        status
    });

    if (error instanceof MulterError)
        return rejectResponse(response, 400, [
            {
                code: error.code,
                message: error.message
            }
        ]);
    if (error instanceof ExtendedError)
        return rejectResponse(response, error.httpCode, error.errors);
    /*
     * A driver failure that is really a CLIENT error — a malformed ObjectId, a duplicate key.
     * `databaseErrorInterpreter` is the single place deciding which ones describe the request;
     * anything it leaves at 500 falls through below. A safety net for a controller that forgot its
     * `.catch()`, not a substitute for one.
     *
     * See: docs/theory/request-flow.md#the-database-branch-is-a-safety-net-not-a-substitute
     */
    const [databaseStatus] = databaseErrorInterpreter(error);
    if (databaseStatus < 500)
        return rejectResponse(response, databaseStatus, [
            {
                code: 'INVALID_REQUEST',
                message: t('generic.error-unknown')
            }
        ]);
    /*
     * The client is told that something failed, and nothing else: a CONSTANT, never
     * `error.message`, which would leak field paths, hosts, filesystem layout or a URL with a key
     * in it. The detail is logged above with the request and trace ids.
     *
     * See: docs/theory/request-flow.md#the-500-branch-says-nothing
     */
    rejectResponse(response, 500, [
        {
            code: 'INTERNAL_ERROR',
            message: t('generic.error-internal')
        }
    ]);
};

/**
 * Mount the global error handler and register the process-level handlers.
 *
 * Must be called after {@link installRoutes}: an express error handler only catches what was
 * mounted before it.
 *
 * @param app - the express application to configure
 */
export const installErrorHandling = (app: Express): void => {
    app.use(handleUncaughtError);

    /*
     * Process-level error handlers — audit unhandled rejections/exceptions
     */
    process
        .on('unhandledRejection', (reason) => {
            auditLogger.error('process.unhandledRejection', {
                action: 'process.unhandledRejection',
                reason:
                    reason instanceof Error
                        ? { name: reason.name, message: reason.message }
                        : String(reason)
            });
        })
        .on('uncaughtException', (error, origin) => {
            /*
             * In production, exit immediately to trigger orchestrator restart
             */
            if (process.env.NODE_ENV !== 'production') return;
            auditLogger.error('process.uncaughtException', {
                action: 'process.uncaughtException',
                name: error.name,
                message: error.message,
                origin
            });
            // The process state after an uncaught exception is unknown, so the only safe move is to
            // stop and let the orchestrator start a clean one. Throwing would re-enter this handler.
            process.exit(1);
        });
};
