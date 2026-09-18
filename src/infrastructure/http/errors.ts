/**
 * @module
 * Error types for the HTTP layer.
 *
 * Two pieces: `ExtendedError`, thrown for the central error middleware to translate into a
 * response; and the database-error interpreter, the single place a Mongo/Mongoose driver failure
 * is mapped to an HTTP status, so all twelve models answer a duplicate key or a bad ObjectId the
 * same way.
 */

import { logger } from '@infrastructure/adapters/logger';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { generateReject, rejectResponse } from './response';
import type { Response } from 'express';

/**
 * Carries the HTTP status alongside a thrown error, so a controller can `throw` and let the
 * central error middleware derive the response instead of passing status codes around by hand.
 *
 * `isOperational` distinguishes expected failures (validation, wrong password) — business
 * outcomes — from unexpected ones, which are bugs and get logged immediately, in the constructor.
 */
export class ExtendedError extends Error {
    // Error name or identifier. Redeclared (it exists on Error) so it can be `readonly`.
    public readonly name: string;
    // HTTP status code appropriate for this error (404, 500, etc)
    public readonly httpCode: number;
    // True for expected/business failures; false means a bug, logged in the constructor below.
    public readonly isOperational: boolean;
    // List of UI errors — user-facing messages, typically already translated, safe to return
    // in the response body (unlike `stack` or raw driver messages).
    public readonly errors: string[];

    /**
     * @param name - stable identifier, e.g. 'ValidationError'
     * @param httpCode - status to send to the client
     * @param isOperational - false means dangerous: an unexpected/programmer error, which is
     *                        logged here on construction. Defaults to false so an unannotated
     *                        throw is treated as the more serious case.
     * @param errors - user-facing messages
     */
    constructor(name: string, httpCode: number, isOperational = false, errors: string[] = []) {
        // Composed from name + errors so `error.message` alone is meaningful in a log line.
        super(name + ': ' + errors.join('. '));
        // ES5-era subclassing of a built-in loses the prototype link, silently breaking
        // `instanceof ExtendedError`. `new.target` points at the actual subclass, so further
        // subclasses keep working too.
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = name;
        this.httpCode = httpCode;
        this.isOperational = isOperational;
        this.errors = errors;
        // Logged here, not by the caller: guarantees a record even if something swallows the
        // throw. Operational errors are skipped — a wrong password is not an incident.
        if (!isOperational)
            logger.error({
                message: this.message,
                // Under `error`, not spread: `serializeError` (adapters/logger.ts) only strips
                // stacks from production logs for values under this key.
                error: this,
                errors: this.errors,
                httpCode: this.httpCode
            });
    }
}

/**
 * Decide which driver failures describe the REQUEST rather than the server — the single place
 * that answer is made, so all twelve models agree on it. A fifth branch belongs here, not in a
 * controller.
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
        // `@modules/access`'s `AccessInvariantError` — an undeclared role, a privilege
        // escalation, or a shop's last administrator. Named rather than imported: `infrastructure`
        // may not reach up into a module, same reason `AuditSink` is a port instead
        // of a direct call — but the STATUS this deserves is a request-shape/state-conflict question
        // exactly like the other four branches above, not the server's fault, so it belongs here and
        // not as a one-off `.catch()` at each of `users`' three write paths.
        if ((error as { name?: string }).name === 'AccessInvariantError')
            return [409, (error as { message?: string }).message ?? 'Unknown error'];
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
    // what makes this findable) rather than returned, since the driver must not speak to the client.
    logger.error(`${context} - ${detail}`, { status });

    return rejectResponse(response, status);
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

    logger.error(`${context} - ${detail}`, { status });

    return generateReject(status);
};
