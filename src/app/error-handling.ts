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
import { fieldError, rejectResponse } from '@infrastructure/http/response';
import { databaseErrorInterpreter, rejectServiceUnavailable } from '@infrastructure/http/errors';
import {
    getActiveSpanContext,
    recordErrorOnActiveSpan
} from '@infrastructure/observability/tracer';
import { processUnhandledRejectionsTotal } from '@infrastructure/observability/metrics-process';
import { t } from '@infrastructure/i18n';
import { isTestEnvironment } from '@infrastructure/runtime/config';

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
 * The multer limits that are about BYTES: a file or a field value that is too big. They answer 413
 * like an oversized JSON body; every other multer limit (counts, shapes) is a 400.
 */
const MULTER_SIZE_LIMIT_CODES: ReadonlySet<string> = new Set([
    'LIMIT_FILE_SIZE',
    'LIMIT_FIELD_VALUE'
]);

/**
 * What status this error should answer, decided once so the log line and the response cannot
 * disagree about it.
 *
 * Order is the argument. `MulterError` is this handler's own hand-translated shape: 413 for a byte
 * limit, 400 for the rest. A declared client error is believed next, because a library that states its own status is
 * more specific than any interpretation below it. The database interpreter is last, and is a
 * safety net for a controller that forgot its `.catch()` rather than a substitute for one.
 */
const resolveStatus = (error: Error): number => {
    if (error instanceof MulterError) return MULTER_SIZE_LIMIT_CODES.has(error.code) ? 413 : 400;

    const declared = clientErrorStatus(error);
    if (declared !== undefined) return declared;

    const [databaseStatus] = databaseErrorInterpreter(error);
    return databaseStatus;
};

/**
 * Names of the driver and ODM errors, by `name` rather than `instanceof`: `mongodb` and `bson`
 * are transitive dependencies and a second copy would make `instanceof` answer false.
 */
const DATABASE_ERROR_NAME =
    /^(?:Mongo\w*Error|Mongoose\w*Error|ValidationError|CastError|BSONError)$/;

/**
 * What of an error may reach the log: the identifying fields, never the message.
 *
 * - a body-parser error: `type` only. Its message quotes the request body (`Unexpected token ...
 *   in JSON`), and a client controls that body.
 * - a Mongo/Mongoose error: name and code only. Its message carries the offending values (a
 *   duplicate-key error names the email).
 * - anything else: unchanged, the logger's own serializer decides.
 *
 * @param error - the unhandled error
 * @param declaredClientError - whether the error declared itself a client error (`expose`, 4xx)
 */
const loggableError = (error: Error, declaredClientError: boolean): unknown => {
    if (declaredClientError && 'type' in error && typeof error.type === 'string')
        return { type: error.type };
    if (DATABASE_ERROR_NAME.test(error.name))
        return { name: error.name, code: 'code' in error ? error.code : undefined };
    return error;
};

/**
 * Global error handler — log once, stack in OTel span.
 *
 * Exported so it can be driven directly. Mounted last, after the 404 catch-all, which is what an
 * error handler has to be and also what makes it unreachable from a route registered afterwards
 * — so a test cannot get at it by adding a throwing route to `app`.
 */
export const handleUncaughtError = (
    thrown: unknown,
    request: Request,
    response: Response,
    next: NextFunction
) => {
    // Anything can be thrown (`throw 'boom'`, a rejected string); a bare non-object has no
    // `name`, `message` or `status` to read, so wrap it once and treat it like any other error.
    const error = thrown instanceof Error ? thrown : new Error(String(thrown));

    // Too late to answer: the status line is already out. Express's own handler closes the
    // connection, where a bare return would leave a half-sent stream open.
    if (response.headersSent) {
        next(error);
        return;
    }

    recordErrorOnActiveSpan(error);

    const status = resolveStatus(error);
    const logged = loggableError(error, clientErrorStatus(error) !== undefined);
    // Same rule for the headline: a stripped error's message is exactly what must not be logged.
    const headline = logged === error ? `${error.name}: ${error.message}` : error.name;

    // The raw `error`, not hand-picked `name`/`message` fields — same reasoning as the
    // process-level handlers below: `redactFormat` (`adapters/logger.ts`) serializes an `Error`
    // into `{name, message, stack}` before JSON output, so passing it whole is what keeps the
    // stack in the log line outside production.
    // A client mistake (409 duplicate, 422 malformed) is the caller's problem, not an incident:
    // logged at `error` it would page someone for every bad request.
    // Stryker disable all
    logger[status >= 500 ? 'error' : 'warn'](headline, {
        requestId: request.requestId,
        traceId: getActiveSpanContext().traceId,
        statusCode: status,
        error: logged
    });
    // Stryker restore all

    // The one throw shape this handler translates by hand: multer's `code` names which limit was
    // hit and stays in the item, but its English `message` is replaced by one translated text.
    // `status` is the 413-or-400 `resolveStatus` already chose.
    // `field` is set only when multer knows which form field broke the rule; then the item names it
    // (`details.field`), as every one-field refusal does. `fieldError` supplies that shape.
    if (error instanceof MulterError) {
        const message = t('generic.error-upload-refused');
        return rejectResponse(response, status, [
            error.field === undefined || error.field === ''
                ? { code: error.code, message }
                : { ...fieldError(error.field, message), code: error.code }
        ]);
    }

    // A dependency outage — the same answer a controller's own `.catch` gives it.
    if (status === 503) return rejectServiceUnavailable(response);

    /*
     * The client is told that something failed, and nothing else: a CONSTANT, never
     * `error.message`, which would leak field paths, hosts, filesystem layout or a URL with a key
     * in it. The detail is logged above with the request and trace ids.
     *
     * See: docs/theory/request-flow.md#the-500-branch-says-nothing
     */
    if (status >= 500) return rejectResponse(response, 500);

    /*
     * A client error, from either source: a library that declared its own status (an oversized or
     * malformed body), or a driver failure that is really about the request — a malformed
     * ObjectId, a duplicate key — which `databaseErrorInterpreter` is the single place to judge.
     * The code and copy are the status's own (`rejectResponse` derives both), a CONSTANT, never
     * `error.message`: `expose: true` is body-parser's judgement about its own text, not a licence to
     * forward library strings.
     *
     * See: docs/theory/request-flow.md#the-database-branch-is-a-safety-net-not-a-substitute
     */
    rejectResponse(response, status);
};

/**
 * Counts and audit-logs a promise rejection nobody handled, then lets the process keep running.
 *
 * Keeping on is a documented choice: one lost promise is not proof the process state is unknown,
 * unlike an uncaught exception. The counter is what makes it alertable instead of a log line.
 *
 * @param reason - whatever the promise was rejected with
 */
export const handleUnhandledRejection = (reason: unknown): void => {
    processUnhandledRejectionsTotal.inc();
    // The raw `reason`, not a hand-flattened `{name, message}` — `redactFormat`
    // (`adapters/logger.ts`) serializes an `Error` into `{name, message, stack}` before JSON
    // output, so passing it whole is what keeps the stack in the log line outside production.
    auditLogger.error('process.unhandledRejection', {
        action: 'process.unhandledRejection',
        error: reason
    });
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
    if (isTestEnvironment()) return;

    /*
     * Process-level error handlers — audit unhandled rejections/exceptions
     */
    process.on('unhandledRejection', handleUnhandledRejection);

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
