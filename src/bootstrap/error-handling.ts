/**
 * The global error handler, and the process-level handlers behind it.
 *
 * Grouped because both answer the same question — what happens to a failure nobody else handled —
 * at the two levels it can be asked: inside a request, and outside one.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { logger, auditLogger } from '@core/adapters/logger';
import { rejectResponse } from '@core/http/response';
import { ExtendedError, databaseErrorInterpreter } from '@core/http/errors';
import { getActiveSpanContext, recordErrorOnActiveSpan } from '@core/observability/tracer';
import { t } from '@core/i18n';

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
     * A database error that is really a CLIENT error — a malformed ObjectId, a duplicate key.
     *
     * `databaseErrorInterpreter` is the single place that decides which driver failures describe
     * the request rather than the server. Anything it maps to a 4xx is answered as one; anything
     * it leaves at 500 falls through to the generic branch below, so an unrecognised error still
     * leaks nothing.
     *
     * A safety net, not a substitute for handling. Every controller ends its chain with a
     * `.catch()` that calls `rejectDatabaseError`, so nothing routinely relies on this branch —
     * but a controller added later may forget one, and forgetting is silent. `POST /orders` with a
     * malformed `productId` once answered 500 for exactly that reason, an ordinary bad request
     * reported as a server fault; found by `tests/fuzz/endpoints.fuzz.test.ts`, which still covers
     * every spec operation and would catch the next one.
     *
     * `errors[]` carries translated copy and the status comes from the interpreter — same rules the
     * per-controller path follows, so a rejection that lands here is answered identically to one
     * that was caught properly.
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
     * The client is told that something failed, and nothing else.
     *
     * `errors[]` carries a constant, never `error.message`. An unexpected error is precisely the
     * case where nobody chose the wording: a Mongoose validation error naming internal field
     * paths, a driver error naming hosts and ports, an ENOENT naming a filesystem layout, a
     * third-party client quoting a URL with a key in it. Any of those is free reconnaissance for
     * an unauthenticated caller, and none of it means anything to the person reading it.
     *
     * The detail is not lost — it is logged above with the request id and trace id, which is
     * where an operator can act on it and a stranger cannot. The envelope's `message` is derived
     * from the status by `resolveErrorMessage` in `core/http/response.ts` and names no handler.
     *
     * Deliberate errors are unaffected: `ExtendedError` carries copy its thrower chose and is
     * returned verbatim by the branch above.
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
            // Deliberate, and the same call `server-lifecycle.ts` makes for a stalled shutdown: the
            // process state after an uncaught exception is unknown, so the only safe move is to stop
            // and let the orchestrator start a clean one. Throwing here would be caught by this very
            // handler.
            // eslint-disable-next-line unicorn/no-process-exit
            process.exit(1);
        });
};
