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
import { generateReject, rejectResponse } from './response';
// `CastError` is what Mongoose throws when a value cannot be coerced to its schema type —
// most commonly a malformed ObjectId in a URL parameter.
import type { CastError } from 'mongoose';
import type { Response } from 'express';

/**
 * Extension of Error class with some customization
 *
 * Carries the HTTP status alongside the failure, so a controller can `throw` and let the
 * central error middleware derive the response instead of every layer passing status codes
 * around by hand.
 *
 * The `isOperational` distinction is the key design idea (from the "operational vs programmer
 * error" split): *expected* failures (validation, 404, wrong password) are business outcomes,
 * while unexpected ones are bugs and get logged immediately, right where the context is richest.
 */
export class ExtendedError extends Error {
    // Error name or identifier. Redeclared (it exists on Error) so it can be `readonly`.
    public readonly name: string;
    // HTTP status code appropriate for this error (404, 500, etc)
    public readonly httpCode: number;
    // Flag to indicate if the error is an operational error.
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
        // Call the parent class (Error) constructor with the message.
        // Composed from name + errors so `error.message` alone is meaningful in a log line.
        super(name + ': ' + errors.join('. '));
        // Restore prototype chain.
        // Required when targeting ES5-era output: subclassing a built-in there loses the
        // prototype link, which silently breaks `instanceof ExtendedError`. `new.target`
        // points at the actually-constructed class, so further subclasses keep working too.
        Object.setPrototypeOf(this, new.target.prototype);
        // set the variables
        this.name = name;
        this.httpCode = httpCode;
        this.isOperational = isOperational;
        this.errors = errors;
        // Dangerous, better log it.
        // Logging in the constructor guarantees a record even if some caller swallows the
        // throw. Operational errors are skipped deliberately — a wrong password is not an
        // incident, and logging every one would drown the real signal.
        // Under `error`, not spread: `serializeError` is what keeps stacks out of production
        // logs, and it only sees what arrives under that key. See `adapters/logger.ts`.
        if (!isOperational)
            logger.error({
                message: this.message,
                error: this,
                errors: this.errors,
                httpCode: this.httpCode
            });
    }
}

/**
 * Mongo's duplicate-key error (E11000): a write a unique index refused.
 *
 * One definition because two layers read it differently — the cart repository as "the world moved
 * between my two steps" and retries, the interpreter as "already taken" and answers 409. Two
 * spellings of the test drifting apart is what this prevents.
 *
 * The CODE is checked, not the message: E11000's text names the index, so matching on it would
 * break the first time one is renamed.
 */
export const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: number } | undefined)?.code === 11_000;

/**
 * Decide which driver failures describe the REQUEST rather than the server. The single place that
 * answer is made, so it is the same on all twelve models.
 *
 * A fifth branch belongs here, not in a controller — see the docs for where each status comes from
 * and what to write on a new one.
 *
 * See: docs/theory/request-flow.md#the-database-error-interpreter
 *
 * @param error - anything Mongoose or the driver threw
 * @returns a `[httpCode, message]` tuple for the response layer
 */
export function databaseErrorInterpreter(error: CastError | Error): [number, string] {
    // `hasOwnProperty` via `Object.prototype.call` rather than `error.hasOwnProperty(...)`:
    // works even on objects with a null prototype or a shadowed `hasOwnProperty`.
    // `kind` is present only on CastError, so it acts as the discriminator.
    // A value that failed a schema path's cast — nearly always an ObjectId in a URL or a filter.
    // Both halves are literals: neither of the error's own fields can supply one.
    if (Object.prototype.hasOwnProperty.call(error, 'kind')) return [422, 'Invalid identifier'];
    // A unique index refused the write: something with that value already exists. This is what
    // makes `unique: true` on `users.email` safe to declare — without it, closing the signup race
    // would merely convert a duplicate account into a 500.
    if (isDuplicateKey(error)) return [409, 'Already exists'];
    /*
     * The driver refused to build an ObjectId at all — distinct from `CastError` above, carries no
     * `kind`, so the discriminator above never saw it.
     *
     * Detected by `name`, not `instanceof BSONError`: `bson` arrives as a transitive dependency of
     * two packages, and an `instanceof` against the wrong copy silently returns false.
     */
    if ((error as { name?: string }).name === 'BSONError') return [422, 'Invalid identifier'];
    /*
     * A schema validator refused the write, which means the MODEL is enforcing something the
     * contract does not. Closing it at the contract is the better fix; this is the floor under
     * that, across all twelve models at once.
     *
     * Detected by `name` for the same reason as the branch above.
     */
    if ((error as { name?: string }).name === 'ValidationError') return [422, 'Invalid request'];
    // Anything else is an unknown server-side failure. The `||` guards against Errors
    // constructed with an empty message.
    return [500, error.message || 'Unknown error'];
}

/**
 * Answer a failed database operation with the status it actually deserves — the single entry point
 * every controller's `.catch` uses, so two rules hold everywhere at once:
 *
 *   - the status is DERIVED by {@link databaseErrorInterpreter}, never assumed;
 *   - the driver never speaks to the client — its message is logged, not returned.
 *
 * @param response - the express response
 * @param context - developer-facing operation name, e.g. `'getProducts'`, recorded in the log line
 * @param error - whatever the driver or Mongoose threw
 */
export const rejectDatabaseError = (
    response: Response,
    context: string,
    error: CastError | Error
) => {
    const [status, detail] = databaseErrorInterpreter(error);

    // `context` and `detail` go to the log, not to the caller. Both are developer-facing: the
    // operation name is internal layout, and the interpreter's detail describes the driver. The
    // log line carries the request id and trace id, which is what makes it findable — and what
    // makes naming the handler in the response body unnecessary.
    logger.error(`${context} - ${detail}`, { status });

    return rejectResponse(response, status);
};

/**
 * The same as {@link rejectDatabaseError}, for code that RETURNS an envelope instead of sending
 * one. Services have no `Response`, so without this each re-derives the status inline and drops
 * the interpreter's detail.
 *
 * @param context - developer-facing operation name, e.g. `'login'`, recorded in the log line
 * @param error - whatever the driver or Mongoose threw
 * @returns the reject envelope for the derived status
 */
export const rejectDatabaseEnvelope = (context: string, error: CastError | Error) => {
    const [status, detail] = databaseErrorInterpreter(error);

    logger.error(`${context} - ${detail}`, { status });

    return generateReject(status);
};
