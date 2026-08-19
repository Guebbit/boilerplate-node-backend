/**
 * Error types for the HTTP layer.
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
 * Mongo's duplicate-key error (E11000): a write that a unique index refused.
 *
 * One definition, two very different consumers, and they are the reason it lives here rather than
 * next to either of them:
 *
 *   - `repositories/carts.ts` treats it as "the world moved between my two steps" and RETRIES.
 *     A contended upsert is expected to lose sometimes, and looking again converges.
 *   - `databaseErrorInterpreter` below treats it as "the caller asked for something already
 *     taken" and answers 409.
 *
 * Both readings are correct for their layer; what would be wrong is two spellings of the test
 * drifting apart, because the second reading is what keeps the first from surfacing as a 500 when
 * the retry budget runs out.
 *
 * The code is checked, not the message: E11000's text names the index and the duplicated value,
 * so matching on it would break the first time an index is renamed.
 */
export const isDuplicateKey = (error: unknown): boolean =>
    (error as { code?: number } | undefined)?.code === 11_000;

/**
 * Interpret mongoose operation error
 *
 * @returns a `[httpCode, message]` tuple for the response layer
 *
 * A `CastError` and a `BSONError` both mean the same thing to a client — "that value is not a
 * usable id" — and both answer 422. They arrive by different routes: Mongoose raises `CastError`
 * when a value fails a schema path's cast, the driver raises `BSONError` when
 * `new ObjectId(...)` itself refuses.
 *
 * `ValidationError` answers 422 as well, for the same underlying reason: a schema validator that
 * refused a write is describing the request, not a fault in the server.
 *
 * The 500 at the end is for genuinely unrecognised failures only. Every branch above exists because
 * something that describes the CALLER was reaching it and being reported as a server fault.
 *
 * WHERE A FIFTH ONE GOES. Another driver error that turns out to describe the request belongs in
 * this function, as a branch carrying a comment that names which driver raises it and why its
 * status is what it is — not in a controller, and not as a `try`/`catch` at the call site. One
 * function is what makes the answer the same on all twelve models, and a call-site catch is
 * invisible to every endpoint that did not think to write one. `tests/fuzz/endpoints.fuzz.test.ts`
 * is what surfaces these: it runs on every commit, and a 500 out of it is this class of error until
 * something proves otherwise.
 *
 * @param error - anything Mongoose threw
 */
export function databaseErrorInterpreter(error: CastError | Error): [number, string] {
    // `hasOwnProperty` via `Object.prototype.call` rather than `error.hasOwnProperty(...)`:
    // works even on objects with a null prototype or a shadowed `hasOwnProperty`.
    // `kind` is present only on CastError, so it acts as the discriminator.
    /*
     * A malformed value for a schema path — nearly always an ObjectId in a URL or a filter.
     *
     * Both halves of the tuple are literals, deliberately. Neither of the error's own fields can
     * supply one: `message` is prose ('Cast to ObjectId failed for value ...'), so parsing a
     * status out of it yields NaN, and `res.status(NaN)` throws inside Express — a client error
     * arriving as a 500. `kind` is a schema type name ('ObjectId'), which describes how ids are
     * built rather than what the caller did wrong.
     *
     * 422 matches the `BSONError` branch below, and every affected endpoint documents it.
     */
    if (Object.prototype.hasOwnProperty.call(error, 'kind')) return [422, 'Invalid identifier'];
    /*
     * A unique index refused the write, which is a statement about the REQUEST, not about the
     * server: something with that value already exists. 409, not the 500 an unrecognised driver
     * error falls through to.
     *
     * This branch is what makes `unique: true` on `users.email` safe to declare. Without it,
     * closing the signup race (two concurrent signups for one address both passing a
     * check-then-insert) would merely convert a duplicate account into a 500 — trading a data
     * bug for an availability bug and an alert at three in the morning.
     *
     * The message is deliberately not the driver's: E11000's text carries the index name and the
     * duplicated value, and the value is user-supplied data (an email address) that has no
     * business being echoed into a response body.
     */
    if (isDuplicateKey(error)) return [409, 'Already exists'];
    /*
     * A malformed id. The driver refused to build an ObjectId from the string a client sent —
     * `''`, `'%00'`, `'undefined'`, anything that is not 24 hex characters.
     *
     * This is a statement about the REQUEST, so it is a 422, which every affected endpoint
     * already documents. Without this branch it reaches the 500 below, and that is reachable
     * WITHOUT A TOKEN: `POST /products/search` is public and takes an `id` filter, so
     * `{"id": ""}` becomes an unauthenticated request producing a server error — an availability
     * signal as much as a correctness one.
     *
     * Detected by `name` rather than by `instanceof BSONError`: the class lives in the `bson`
     * package, which reaches this process as a transitive dependency of two different packages,
     * and an `instanceof` against the wrong copy silently returns false.
     *
     * NOT the same thing as the `CastError` branch above. Mongoose raises `CastError` when a
     * value fails a SCHEMA path's cast; the driver raises `BSONError` when `new ObjectId(...)`
     * itself refuses. The second is what `toObjectId` in `@infrastructure/persistence/base-repository` produces, and it
     * carries no `kind`, so the discriminator above never saw it.
     *
     * The message is deliberately generic: the driver's names the expected encoding, which is
     * internal detail that tells an attacker how ids are formed.
     */
    if ((error as { name?: string }).name === 'BSONError') return [422, 'Invalid identifier'];
    /*
     * A schema validator refused the write: a `required` path left empty, a value outside `min`/
     * `max`, a string that failed `match`, an entry absent from an `enum`. Every one of those is a
     * statement about the REQUEST, so 422 — the same answer the two branches above give.
     *
     * WHY THIS IS NOT ALREADY IMPOSSIBLE. Request bodies are validated by Zod schemas generated
     * from `openapi.yaml` before a controller runs, so a validator firing means Mongoose is
     * enforcing something the contract does not — either because JSON Schema cannot express it, or
     * because it was expressed only on the model. `POST /locales` was the worked example: a display
     * name of one space satisfies `minLength: 1`, then the schema's `trim` reduces it to `''` and
     * `required` refuses it. That answered 500 to a stray space, on an admin route, found by
     * `tests/fuzz/endpoints.fuzz.test.ts` on its third generated case.
     *
     * Closing it AT THE CONTRACT is still the better fix where the constraint can be expressed
     * there — `write-locales.ts` now extends the generated body with `z.string().trim().min(1)`,
     * which rejects the request before a database round trip and documents itself in the schema.
     * This branch is the floor under that: it turns whatever slips through into an honest 4xx
     * instead of a server fault, across all twelve models at once rather than one endpoint at a
     * time.
     *
     * Detected by `name`, matching the `BSONError` branch above and for the same reason: the
     * `ValidationError` class is Mongoose's, and an `instanceof` against a second copy of the
     * package silently returns false.
     *
     * The message is deliberately generic. Mongoose's own text enumerates the failing paths and
     * their values — user-supplied data, and a description of the schema, neither of which belongs
     * in a response body.
     */
    if ((error as { name?: string }).name === 'ValidationError') return [422, 'Invalid request'];
    // Anything else is an unknown server-side failure. The `||` guards against Errors
    // constructed with an empty message.
    return [500, error.message || 'Unknown error'];
}

/**
 * Answer a failed database operation with the status it actually deserves.
 *
 * The single entry point every controller's `.catch` uses, so two rules hold everywhere at once
 * rather than per handler:
 *
 *   - **The status is derived, never assumed.** {@link databaseErrorInterpreter} decides it. A
 *     hardcoded 500 turns a malformed id into a server error, and on a public endpoint that is an
 *     availability signal rather than a client mistake.
 *   - **The driver never speaks to the client.** `errors[]` is the user-facing, translated array
 *     by this repo's convention (see the i18n note in `@infrastructure/http/request`); a driver message is
 *     neither, and describes internals. It is logged by `ExtendedError`'s constructor and by the
 *     request logger, which is where an operator looks.
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
 * The same as {@link rejectDatabaseError}, for code that returns an envelope instead of sending it.
 *
 * Services report failure by *returning* `generateReject(...)` — they have no `Response` — so they
 * cannot call `rejectDatabaseError`. Without this they each re-derived the status inline and
 * dropped the interpreter's detail on the floor, which is how six `.catch` handlers ended up
 * spreading the interpreter's tuple straight into the envelope.
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
