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
import { isDuplicateKey, isConnectionError } from '@infrastructure/persistence/mongo-errors';
import { isRedisConnectionError } from '@infrastructure/adapters/redis';
import { generateReject, rejectResponse } from './response';
import type { Response } from 'express';

/**
 * Base for a domain error that deserves 409 Conflict — the write was refused for what it would
 * make TRUE (an undeclared role, a privilege escalation, a duplicate slug), not because the
 * request was malformed. A module throws its OWN subclass (`access`'s `AccessInvariantError`
 * below) rather than this class directly, so a caller catching a specific failure still can —
 * `instanceof` on the base is only how {@link databaseErrorInterpreter} recognises the FAMILY.
 * `infrastructure` names no module (`docs/theory/layers.md:8`): it exports the shape, a module
 * subclasses it, and the mapping below never spells out which module that was.
 */
export class ConflictError extends Error {}

/**
 * Whether a failure means an infrastructure dependency (Mongo, Redis) was unreachable, rather
 * than a request the server understood and refused. RFC 9110 §15.6.4: 503 says the SERVER is
 * temporarily broken; every other branch below is about the REQUEST.
 *
 * @param error - whatever the caught rejection actually was
 */
export const isInfrastructureError = (error: unknown): boolean =>
    isConnectionError(error) || isRedisConnectionError(error);

/**
 * Decide what status a driver failure deserves — the request's fault (4xx), a dependency outage
 * (503), or a bug (500) — in the single place that answer is made, so all twelve models agree on
 * it. A new branch belongs here, not in a controller.
 *
 * See: docs/theory/request-flow.md#the-database-error-interpreter
 *
 * @param error - whatever the caught rejection actually was — a driver/Mongoose error in every
 *   case seen so far, but a `.catch()` callback's argument is never provably one
 * @returns a `[httpCode, message]` tuple for the response layer
 */
export function databaseErrorInterpreter(error: unknown): [number, string] {
    // Every branch below reads a property off `error` — nothing to interpret on a rejection that
    // was never an object (`null`, a string, a thrown number) — those fall to the generic 500.
    if (error !== null && typeof error === 'object') {
        // `kind` exists only on CastError — the discriminator. Checked via `Object.prototype.call`
        // rather than `error.hasOwnProperty()` so it still works on a null-prototype object.
        if (Object.prototype.hasOwnProperty.call(error, 'kind')) return [422, 'Invalid identifier'];
        // A unique index refused the write: something with that value already exists. This is what
        // makes `unique: true` on `users.email` safe to declare — without it, closing the signup race
        // would merely convert a duplicate account into a 500.
        if (isDuplicateKey(error)) return [409, 'Already exists'];
        // BSONError: the driver refused to build an ObjectId at all, distinct from CastError above.
        // Detected by `name`, not `instanceof`: `bson` is a transitive dependency of two packages,
        // and `instanceof` against the wrong copy silently returns false.
        if ((error as { name?: string }).name === 'BSONError') return [422, 'Invalid identifier'];
        // A schema validator refused the write — the MODEL enforcing something the contract does not.
        // Closing it at the contract is the better fix; this is the floor under that, across all
        // twelve models. Detected by `name`, same reason as BSONError above.
        if ((error as { name?: string }).name === 'ValidationError')
            return [422, 'Invalid request'];
        // Any module's {@link ConflictError} subclass — `access`'s `AccessInvariantError` is the
        // one that exists today, for an undeclared role or a privilege escalation. `instanceof`,
        // not a `name` string: this class is defined once, here, so there is no second copy of it
        // anywhere for `instanceof` to disagree with (the caveat that rules it out for `BSONError`
        // above does not apply). The STATUS this deserves is a request-shape/state-conflict
        // question exactly like the other four branches above, not the server's fault, so it
        // belongs here and not as a one-off `.catch()` at each of `users`' three write paths.
        if (error instanceof ConflictError) return [409, error.message || 'Unknown error'];
        // Mongo/Redis unreachable — the server is temporarily broken, not the request. Checked
        // before the generic fallback below, which would otherwise answer 500 and imply a bug.
        if (isInfrastructureError(error)) return [503, 'Service unavailable'];
        // An unknown server-side failure, but still Error-SHAPED — own or inherited `.message`,
        // never gated on `instanceof`: a driver/test fixture built via `Object.assign` onto a
        // non-Error prototype is exactly as readable here as a real `Error`. The `||` guards
        // against an empty string, same as a message-less `Error` always has.
        const { message } = error as { message?: unknown };
        return [500, (typeof message === 'string' && message) || 'Unknown error'];
    }
    // Never an object at all (`null`, a string, a thrown number) — nothing to read a message off.
    return [500, 'Unknown error'];
}

/**
 * A rough hint, not a promise — how long a client should wait before retrying a 503. There is no
 * backoff state to read this from (an infra outage's real duration is unknown), so one constant
 * for every 503 is honest about that, rather than inventing a number that looks computed.
 * RFC 9110 §10.2.3.
 */
const RETRY_AFTER_SECONDS = 5;

/** The one error item every 503 carries, whichever path noticed the outage. */
const serviceUnavailableError = () => ({
    code: 'SERVICE_UNAVAILABLE',
    message: t('generic.error-service-unavailable')
});

/**
 * Answer a dependency outage: 503, `SERVICE_UNAVAILABLE`, and a `Retry-After` hint — the same
 * answer from the global error handler and from a controller's own `.catch`.
 *
 * @param response - the express response
 */
export const rejectServiceUnavailable = (response: Response) => {
    response.setHeader('Retry-After', RETRY_AFTER_SECONDS.toString());
    return rejectResponse(response, 503, [serviceUnavailableError()]);
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

    // `context` and `detail` are developer-facing — logged with the request/trace id (which is
    // what makes this findable) rather than returned, since the driver must not speak to the
    // client. `error` under its own key, not folded into the message string, is what lets the
    // logger's own serializer attach a stack trace — see `adapters/logger.ts`'s `serializeError`.
    // Stryker disable next-line all
    logger.error(`${context} - ${detail}`, { status, error });

    return status === 503 ? rejectServiceUnavailable(response) : rejectResponse(response, status);
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

    // Stryker disable next-line all
    logger.error(`${context} - ${detail}`, { status, error });

    // No `Retry-After` here: an envelope has no response to set it on.
    return status === 503
        ? generateReject(503, [serviceUnavailableError()])
        : generateReject(status);
};
