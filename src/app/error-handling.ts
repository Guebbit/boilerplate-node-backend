/**
 * @module
 * The global error handler, and the process-level handlers behind it.
 *
 * Grouped because both answer the same question — what happens to a failure nobody else handled —
 * at the two levels it can be asked: inside a request, and outside one.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import { logger, auditLogger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { databaseErrorInterpreter } from '@infrastructure/http/errors';
import {
    getActiveSpanContext,
    recordErrorOnActiveSpan
} from '@infrastructure/observability/tracer';
import { t } from '@infrastructure/i18n';

/**
 * A client error thrown by a library that follows the `http-errors` contract.
 *
 * Read as a CONTRACT, never as a list of `.type` strings. body-parser alone throws six shapes
 * this way — `entity.too.large`, `entity.parse.failed`, `entity.verify.failed`,
 * `encoding.unsupported`, `charset.unsupported`, `request.aborted` — and a branch per type has to
 * be revised each time it gains a seventh, to assign a status the error is already carrying.
 *
 * `expose` is required as well as the 4xx range: it is the thrower's own statement that this
 * describes the REQUEST rather than the server, and a library may well set a 4xx on something it
 * still considers internal.
 *
 * @param error - the unhandled error, which may carry no such fields at all
 * @returns the status it declares, or `undefined` when it declares none
 */
const clientErrorStatus = (error: Error): number | undefined => {
    // `in` narrows an unlisted property to `unknown` rather than widening the object — no cast,
    // and every read below is checked before it is used.
    if (!('expose' in error) || error.expose !== true) return undefined;

    const declared =
        'status' in error ? error.status : 'statusCode' in error ? error.statusCode : undefined;

    return typeof declared === 'number' && declared >= 400 && declared < 500 ? declared : undefined;
};

/**
 * The copy a declared client error answers with.
 *
 * A CONSTANT per status, never `error.message`. `expose: true` is body-parser's judgement about
 * its own text, not a licence for this handler to start forwarding library strings — the rule
 * that the client learns the status and nothing else is what keeps field paths, hosts and
 * filesystem layout out of responses.
 *
 * See: docs/theory/request-flow.md#the-500-branch-says-nothing
 */
const CLIENT_ERROR_COPY: Record<number, { code: string; messageKey: string }> = {
    400: { code: 'BAD_REQUEST', messageKey: 'generic.error-bad-request' },
    413: { code: 'PAYLOAD_TOO_LARGE', messageKey: 'generic.error-payload-too-large' },
    415: { code: 'UNSUPPORTED_MEDIA_TYPE', messageKey: 'generic.error-unsupported-media-type' }
};

/**
 * What status this error should answer, decided once so the log line and the response cannot
 * disagree about it.
 *
 * Order is the argument. `MulterError` is this handler's own hand-translated shape and keeps its
 * 400. A declared client error is believed next, because a library that states its own status is
 * more specific than any interpretation below it. The database interpreter is last, and is a
 * safety net for a controller that forgot its `.catch()` rather than a substitute for one.
 */
const resolveStatus = (error: Error): number => {
    if (error instanceof MulterError) return 400;

    const declared = clientErrorStatus(error);
    if (declared !== undefined) return declared;

    const [databaseStatus] = databaseErrorInterpreter(error);
    return databaseStatus;
};

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
    next: NextFunction
) => {
    // Too late to answer: the status line is already out. Express's own handler closes the
    // connection, where a bare return would leave a half-sent stream open.
    if (response.headersSent) {
        next(error);
        return;
    }

    recordErrorOnActiveSpan(error);

    const status = resolveStatus(error);

    // The raw `error`, not hand-picked `name`/`message` fields — same reasoning as the
    // process-level handlers below: `redactFormat` (`adapters/logger.ts`) serializes an `Error`
    // into `{name, message, stack}` before JSON output, so passing it whole is what keeps the
    // stack in the log line outside production.
    // Stryker disable all
    logger.error(`${error.name}: ${error.message}`, {
        request_id: request.requestId,
        trace_id: getActiveSpanContext().traceId,
        status,
        error
    });
    // Stryker restore all

    // The one throw shape this handler translates by hand, and the only one whose own copy is
    // forwarded: multer's messages are chosen for an end user and name no internals.
    if (error instanceof MulterError)
        return rejectResponse(response, 400, [
            {
                code: error.code,
                message: error.message
            }
        ]);

    /*
     * The client is told that something failed, and nothing else: a CONSTANT, never
     * `error.message`, which would leak field paths, hosts, filesystem layout or a URL with a key
     * in it. The detail is logged above with the request and trace ids.
     *
     * See: docs/theory/request-flow.md#the-500-branch-says-nothing
     */
    if (status >= 500)
        return rejectResponse(response, 500, [
            {
                code: 'INTERNAL_ERROR',
                message: t('generic.error-internal')
            }
        ]);

    /*
     * A client error, from either source: a library that declared its own status (an oversized or
     * malformed body), or a driver failure that is really about the request — a malformed
     * ObjectId, a duplicate key — which `databaseErrorInterpreter` is the single place to judge.
     * Statuses with no copy of their own fall back to the generic one rather than inventing any.
     *
     * See: docs/theory/request-flow.md#the-database-branch-is-a-safety-net-not-a-substitute
     */
    const copy = CLIENT_ERROR_COPY[status] ?? {
        code: 'INVALID_REQUEST',
        messageKey: 'generic.error-unknown'
    };

    rejectResponse(response, status, [{ code: copy.code, message: t(copy.messageKey) }]);
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

    // No handler under a test runner, for either process-level event: registering one for
    // `unhandledRejection` swallows it into an audit line instead of letting Jest's own handler
    // pin the rejection on the test that caused it, same reasoning as `uncaughtException` below.
    if (process.env.NODE_ENV === 'test') return;

    /*
     * Process-level error handlers — audit unhandled rejections/exceptions
     */
    process.on('unhandledRejection', (reason) => {
        // The raw `reason`, not a hand-flattened `{name, message}` — `redactFormat`
        // (`adapters/logger.ts`) serializes an `Error` into `{name, message, stack}` before JSON
        // output, so passing it whole is what keeps the stack in the log line outside production.
        auditLogger.error('process.unhandledRejection', {
            action: 'process.unhandledRejection',
            error: reason
        });
    });

    process.on('uncaughtException', (error, origin) => {
        // The raw `error`, not hand-picked `name`/`message` fields — see the unhandledRejection
        // handler above for why.
        auditLogger.error('process.uncaughtException', {
            action: 'process.uncaughtException',
            error,
            origin
        });
        // Logged first, then stopped, in every environment: the state after an uncaught exception
        // is unknown, so the only safe move is to stop. Throwing would re-enter this handler.
        process.exit(1);
    });
};
