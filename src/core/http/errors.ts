/**
 * Error types for the HTTP layer.
 */

import { logger } from '@core/adapters/logger';
// `CastError` is what Mongoose throws when a value cannot be coerced to its schema type —
// most commonly a malformed ObjectId in a URL parameter.
import type { CastError } from 'mongoose';

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
        // Capture stack trace for debugging if NOT extending Error
        // Error.captureStackTrace(this);
        // Dangerous, better log it.
        // Logging in the constructor guarantees a record even if some caller swallows the
        // throw. Operational errors are skipped deliberately — a wrong password is not an
        // incident, and logging every one would drown the real signal.
        if (!isOperational)
            logger.error({
                message: this.message,
                stack: this.stack,
                name: this.name,
                errors: this.errors,
                httpCode: this.httpCode
            });
    }
}

/**
 * Interpret mongoose operation error
 *
 * @returns a `[httpCode, message]` tuple for the response layer
 *
 * CAVEAT: the CastError branch reads the status from `error.message` and the message from
 * `error.kind`, i.e. the two are swapped relative to their names — `kind` holds the expected
 * schema type ('ObjectId'), and `message` is prose, so `parseInt` on it yields NaN. Documented
 * rather than changed, since callers may already depend on the current shape.
 *
 * @param error - anything Mongoose threw
 */
export function databaseErrorInterpreter(error: CastError | Error): [number, string] {
    // `hasOwnProperty` via `Object.prototype.call` rather than `error.hasOwnProperty(...)`:
    // works even on objects with a null prototype or a shadowed `hasOwnProperty`.
    // `kind` is present only on CastError, so it acts as the discriminator.
    if (Object.prototype.hasOwnProperty.call(error, 'kind'))
        return [Number.parseInt((error as CastError).message), (error as CastError).kind];
    // Anything else is an unknown server-side failure. The `||` guards against Errors
    // constructed with an empty message.
    return [500, error.message || 'Unknown error'];
}
