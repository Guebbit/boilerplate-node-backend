/**
 * @module
 * The database-error interpreter — the single place a driver failure (Mongo, Mongoose, or an
 * unreachable Redis) is mapped to an HTTP status, so all twelve models answer a duplicate key, a
 * bad ObjectId or an outage the same way.
 *
 * No "throw with a status from anywhere" facility here: a middleware with the `Response` already
 * in hand answers `rejectResponse` directly instead. If a genuine need for one arises, the
 * standard answer is `http-errors` (already in the tree transitively via Express), not a bespoke
 * class.
 */

import { logger } from '@infrastructure/adapters/logger';
import { t } from '@infrastructure/i18n';
import {
    isDuplicateKey,
    isConnectionError,
    isQueryTimeout
} from '@infrastructure/persistence/mongo-errors';
import { PreconditionFailedError } from '@infrastructure/persistence/versioning';
import { isRedisConnectionError } from '@infrastructure/adapters/redis';
import { ServiceBusyError } from '@infrastructure/runtime/busy';
import { recordErrorOnActiveSpan } from '@infrastructure/observability/tracer';
import { queryTimeoutsTotal } from '@infrastructure/observability/metrics-database';
import { generateReject, rejectResponse } from './response';
/**
 * Type-only — see `response.ts`'s own import for why: this file sits on `contracts:bundle`'s
 * incidental module-load path, which runs before `@api/error-codes` exists.
 */
import type { ErrorCode } from '@api/error-codes';
import type { Response } from 'express';

/**
 * Base for a domain error that deserves 409 Conflict — the write was refused for what it would
 * make TRUE (an undeclared role, a privilege escalation, a duplicate slug), not because the
 * request was malformed. A module throws its OWN subclass (`access`'s `AccessInvariantError`
 * below) rather than this class directly, so a caller catching a specific failure still can —
 * `instanceof` on the base is only how {@link databaseErrorInterpreter} recognises the FAMILY.
 * `infrastructure` names no module (`docs/understand/layers.md`): it exports the shape, a module
 * subclasses it, and the mapping below never spells out which module that was.
 */
export class ConflictError extends Error {
    /** What logs and `error.name` print; a subclass does not set it by itself. */
    override name = 'ConflictError';
}

/**
 * Whether a failure means an infrastructure dependency (Mongo, Redis) was unreachable, a bounded
 * queue (the PDF renders) was full, or a query ran past the server's time limit, rather
 * than a request the server understood and refused. RFC 9110 §15.6.4: 503 says the SERVER is
 * temporarily broken; every other branch below is about the REQUEST.
 *
 * @param error - whatever the caught rejection actually was
 */
export const isInfrastructureError = (error: unknown): boolean =>
    isConnectionError(error) ||
    isRedisConnectionError(error) ||
    isQueryTimeout(error) ||
    error instanceof ServiceBusyError;

/**
 * Decide what status a driver failure deserves — the request's fault (4xx), a dependency outage
 * (503), or a bug (500) — in the single place that answer is made, so all twelve models agree on
 * it. A new branch belongs here, not in a controller.
 *
 * @see docs/understand/request-flow.md#the-database-error-interpreter
 * @param error - whatever the caught rejection actually was — a driver/Mongoose error in every
 *   case seen so far, but a `.catch()` callback's argument is never provably one
 * @returns a `[httpCode, message]` tuple for the response layer
 */
export function databaseErrorInterpreter(error: unknown): [number, string] {
    /**
     * Every branch below reads a property off `error` — nothing to interpret on a rejection that
     * was never an object (`null`, a string, a thrown number) — those fall to the generic 500.
     */
    if (error !== null && typeof error === 'object') {
        /**
         * `kind` exists only on CastError — the discriminator. Checked via `Object.prototype.call`
         * rather than `error.hasOwnProperty()` so it still works on a null-prototype object.
         */
        if (Object.prototype.hasOwnProperty.call(error, 'kind')) return [422, 'Invalid identifier'];
        /**
         * A unique index refused the write: something with that value already exists. This is what
         * makes `unique: true` on `users.email` safe to declare — without it, closing the signup race
         * would merely convert a duplicate account into a 500.
         */
        if (isDuplicateKey(error)) return [409, 'Already exists'];
        /**
         * BSONError: the driver refused to build an ObjectId at all, distinct from CastError above.
         * Detected by `name`, not `instanceof`: `bson` is a transitive dependency of two packages,
         * and `instanceof` against the wrong copy silently returns false.
         */
        if ((error as { name?: string }).name === 'BSONError') return [422, 'Invalid identifier'];
        /**
         * A schema validator refused the write — the MODEL enforcing something the contract does not.
         * Closing it at the contract is the better fix; this is the floor under that, across all
         * twelve models. Detected by `name`, same reason as BSONError above.
         */
        if ((error as { name?: string }).name === 'ValidationError')
            return [422, 'Invalid request'];
        /**
         * Any module's {@link ConflictError} subclass — `access`'s `AccessInvariantError` is the
         * one that exists today, for an undeclared role or a privilege escalation. `instanceof`,
         * not a `name` string: this class is defined once, here, so there is no second copy of it
         * anywhere for `instanceof` to disagree with (the caveat that rules it out for `BSONError`
         * above does not apply). The STATUS this deserves is a request-shape/state-conflict
         * question exactly like the other four branches above, not the server's fault, so it
         * belongs here and not as a one-off `.catch()` at each of `users`' three write paths.
         */
        if (error instanceof ConflictError) return [409, error.message || 'Unknown error'];
        // The caller's `If-Match` no longer describes the row: 412, and the row is untouched.
        if (error instanceof PreconditionFailedError) return [412, 'Precondition failed'];
        /**
         * A query ran past the server's time limit: 503 like an outage, but its own detail, so the
         * log line and the response code (`QUERY_TIMEOUT`) say which of the two it was.
         */
        if (isQueryTimeout(error)) return [503, 'Query timed out'];
        /**
         * Mongo/Redis unreachable, or a full queue — the server is temporarily broken, not the
         * request. Checked before the generic fallback below, which would answer 500 (a bug).
         */
        if (isInfrastructureError(error)) return [503, 'Service unavailable'];
        /**
         * An unknown server-side failure, but still Error-SHAPED — own or inherited `.message`,
         * never gated on `instanceof`: a driver/test fixture built via `Object.assign` onto a
         * non-Error prototype is exactly as readable here as a real `Error`. The `||` guards
         * against an empty string, same as a message-less `Error` always has.
         */
        const { message } = error as { message?: unknown };
        return [500, (typeof message === 'string' && message) || 'Unknown error'];
    }
    // Never an object at all (`null`, a string, a thrown number) — nothing to read a message off.
    return [500, 'Unknown error'];
}

/**
 * The one error item a 503 carries, whichever path noticed it: `QUERY_TIMEOUT` for a query the
 * server killed at its time limit, `SERVICE_UNAVAILABLE` for everything else.
 *
 * @param error - the failure behind the 503, when the caller has one
 */
const serviceUnavailableError = (error?: unknown): { code: ErrorCode; message: string } =>
    isQueryTimeout(error)
        ? { code: 'QUERY_TIMEOUT', message: t('generic.error-query-timeout') }
        : { code: 'SERVICE_UNAVAILABLE', message: t('generic.error-service-unavailable') };

/**
 * Answer a 503: `SERVICE_UNAVAILABLE` for a dependency outage, `QUERY_TIMEOUT` for a killed
 * query — the same answer from the global error handler and from a controller's own `.catch`.
 * `rejectResponse` adds the `Retry-After` hint.
 *
 * @param response - the express response
 * @param error - the failure behind it, when there is one; picks the code
 */
export const rejectServiceUnavailable = (response: Response, error?: unknown) => {
    return rejectResponse(response, 503, [serviceUnavailableError(error)]);
};

/**
 * Log a database-derived failure at the severity it deserves: `warn` for a 4xx (the request's
 * fault — a duplicate key, a bad id, a refused write), `error` for a 5xx (the server's). Without
 * the split, an ordinary 409/422 — the everyday case `unique: true` and a bad id exist to turn
 * into a clean 4xx — paged the same as a genuine outage.
 *
 * @param context - developer-facing operation name, e.g. `'getProducts'`, recorded in the log line
 * @param status - the status {@link databaseErrorInterpreter} derived
 * @param detail - the interpreter's own message for that status
 * @param error - whatever the `.catch()` caught — never assumed to be an `Error`
 * @param requestId - the request's id, when the caller has a response to read it from
 */
const logDatabaseFailure = (
    context: string,
    status: number,
    detail: string,
    error: unknown,
    requestId?: string
): void => {
    // A 5xx is the server's own failure: mark the trace red too, which is how its error rate counts.
    if (status >= 500) recordErrorOnActiveSpan(error);
    if (isQueryTimeout(error)) queryTimeoutsTotal.inc();
    /**
     * The interpreter's 500 detail IS the error's message, which can quote data: the headline
     * for a 500 names the error class instead. `error` under its own key, not folded into the
     * message string, is what lets the logger's own serializer attach a stack trace and scrub
     * the message — see `adapters/logger.ts`'s `serializeError`. `trace_id` is stamped by the logger.
     */
    const errorName = error instanceof Error ? error.name : 'Unknown error';
    const headline = status === 500 ? errorName : detail;
    // Stryker disable next-line all
    logger[status < 500 ? 'warn' : 'error'](`${context} - ${headline}`, {
        status,
        requestId,
        error
    });
};

/**
 * Answer a failed database operation with the status it actually deserves — the single entry
 * point every controller's `.catch` uses. The status is DERIVED by
 * {@link databaseErrorInterpreter}, never assumed, and the driver's message is logged, never
 * returned to the client.
 *
 * @param response - the express response
 * @param context - developer-facing operation name, e.g. `'getProducts'`, recorded in the log line
 * @param error - whatever the `.catch()` caught — never assumed to be an `Error`
 */
export const rejectDatabaseError = (response: Response, context: string, error: unknown) => {
    const [status, detail] = databaseErrorInterpreter(error);

    // The request-id middleware set this header; it is how the client's id finds this line.
    const requestId = response.getHeader('x-request-id');
    logDatabaseFailure(
        context,
        status,
        detail,
        error,
        typeof requestId === 'string' ? requestId : undefined
    );

    return status === 503
        ? rejectServiceUnavailable(response, error)
        : rejectResponse(response, status);
};

/**
 * The same as {@link rejectDatabaseError}, for code that RETURNS an envelope instead of sending
 * one. Services have no `Response`, so without this each re-derives the status inline and drops
 * the interpreter's detail.
 *
 * @param context - developer-facing operation name, e.g. `'login'`, recorded in the log line
 * @param error - whatever the `.catch()` caught — never assumed to be an `Error`
 * @returns the reject envelope for the derived status
 */
export const rejectDatabaseEnvelope = (context: string, error: unknown) => {
    const [status, detail] = databaseErrorInterpreter(error);

    logDatabaseFailure(context, status, detail, error);

    // No `Retry-After` here: `rejectResponse` adds it when this envelope is sent.
    return status === 503
        ? generateReject(503, [serviceUnavailableError(error)])
        : generateReject(status);
};
