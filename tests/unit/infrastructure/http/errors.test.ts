/**
 * HTTP error types — `src/infrastructure/http/errors.ts`.
 *
 * Two units with quite different risk profiles:
 *
 *   `ExtendedError` — carries the HTTP status alongside the failure and decides, via
 *   `isOperational`, whether the failure is a business outcome or a bug worth logging. Getting
 *   the default wrong in either direction is costly: log everything and a wrong password becomes
 *   an incident; log nothing and a real bug disappears if a caller swallows the throw.
 *
 *   `databaseErrorInterpreter` — maps a driver or Mongoose error onto a `[httpCode, message]`
 *   tuple, and `rejectDatabaseError` turns that into a response. Between them they decide whether
 *   a failure is the client's fault or the server's, which is the difference between a 4xx a
 *   client can act on and a 500 that pages someone. Three of its branches exist because a real
 *   request produced the wrong one: a malformed id answered 500 on a PUBLIC endpoint and echoed
 *   the driver's prose into the body.
 */

import {
    ExtendedError,
    databaseErrorInterpreter,
    isDuplicateKey,
    rejectDatabaseEnvelope,
    rejectDatabaseError
} from '@infrastructure/http/errors';
import type { Response } from 'express';
import { logger } from '@infrastructure/adapters/logger';
import type { CastError } from 'mongoose';
import { makeResponseStub } from '@tests/express';

jest.mock('@infrastructure/adapters/logger', () => ({
    __esModule: true,
    logger: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

/** A CastError-shaped object: `kind` as an own property is the discriminator. */
const makeCastError = (): CastError =>
    Object.assign(new Error('Cast to ObjectId failed for value "abc" at path "_id"'), {
        kind: 'ObjectId',
        path: '_id',
        value: 'abc'
    }) as unknown as CastError;

describe('ExtendedError', () => {
    it('exposes the name, status, operational flag and user-facing errors it was given', () => {
        const error = new ExtendedError('ValidationError', 422, true, ['Email is required']);

        expect(error.name).toBe('ValidationError');
        expect(error.httpCode).toBe(422);
        expect(error.isOperational).toBe(true);
        expect(error.errors).toEqual(['Email is required']);
    });

    it('composes `message` from the name and the joined errors', () => {
        // The documented reason: `error.message` alone has to be meaningful in a log line, where
        // the structured fields may not travel with it.
        const error = new ExtendedError('ValidationError', 422, true, [
            'Email is required',
            'Password too short'
        ]);

        expect(error.message).toBe('ValidationError: Email is required. Password too short');
    });

    it('is a real Error and satisfies instanceof after prototype restoration', () => {
        const error = new ExtendedError('NotFound', 404, true);

        // The `Object.setPrototypeOf(this, new.target.prototype)` line exists precisely so these
        // hold when the class is down-levelled; without it `instanceof ExtendedError` is false
        // and every `catch` that branches on the type silently stops matching.
        expect(error).toBeInstanceOf(ExtendedError);
        expect(error).toBeInstanceOf(Error);
        expect(error.stack).toBeDefined();
    });

    it('keeps instanceof working for a subclass', () => {
        // `new.target` (rather than `ExtendedError.prototype`) is what makes this hold.
        class NotFoundError extends ExtendedError {
            constructor() {
                super('NotFound', 404, true, ['Nothing here']);
            }
        }

        const error = new NotFoundError();

        expect(error).toBeInstanceOf(NotFoundError);
        expect(error).toBeInstanceOf(ExtendedError);
    });

    it('defaults to non-operational, the more serious case', () => {
        // Documented intent: "Defaults to false so an unannotated throw is treated as the more
        // serious case." An unannotated throw must not be able to pass itself off as routine.
        const error = new ExtendedError('Boom', 500);

        expect(error.isOperational).toBe(false);
        expect(error.errors).toEqual([]);
    });

    it('logs on construction when the error is NOT operational', () => {
        new ExtendedError('UnexpectedFailure', 500, false, ['Something broke']);

        expect(mockedLogger.error).toHaveBeenCalledTimes(1);
        expect(mockedLogger.error).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'UnexpectedFailure',
                httpCode: 500,
                errors: ['Something broke'],
                message: 'UnexpectedFailure: Something broke'
            })
        );
    });

    it('stays silent for an operational error', () => {
        // "A wrong password is not an incident, and logging every one would drown the real
        // signal." This assertion is the one that keeps that true.
        new ExtendedError('Unauthorized', 401, true, ['Wrong credentials']);

        expect(mockedLogger.error).not.toHaveBeenCalled();
    });

    it('logs the default-constructed error, since the default is non-operational', () => {
        new ExtendedError('Boom', 500);

        expect(mockedLogger.error).toHaveBeenCalledTimes(1);
    });
});

describe('databaseErrorInterpreter', () => {
    it('maps an ordinary Error to a 500 carrying its message', () => {
        const result = databaseErrorInterpreter(new Error('connection reset'));

        expect(result).toEqual([500, 'connection reset']);
    });

    it('substitutes a placeholder when the Error carries an empty message', () => {
        // `||` rather than `??` on purpose: '' must fall through, or the client receives a
        // failure envelope with no message at all.
        // eslint-disable-next-line unicorn/error-message -- the empty message is the input under test
        const result = databaseErrorInterpreter(new Error(''));

        expect(result).toEqual([500, 'Unknown error']);
    });

    it('discriminates on an OWN `kind` property, not an inherited one', () => {
        // `Object.prototype.hasOwnProperty.call(...)` is used so an object that merely inherits
        // `kind` is not mistaken for a CastError.
        const inheritsKind = Object.create({ kind: 'ObjectId' }) as Error;
        Object.assign(inheritsKind, { message: 'inherited, not own' });

        expect(databaseErrorInterpreter(inheritsKind)).toEqual([500, 'inherited, not own']);
    });

    /**
     * A CastError means the same thing to a client as a BSONError — "that is not a usable id" —
     * so both answer 422.
     *
     * The cases below pin the tuple against the two fields the error itself carries, because
     * deriving either from them is the tempting mistake: `message` is prose, so a status parsed
     * out of it is NaN, and `res.status(NaN)` throws inside Express — turning a client error into
     * a 500. `kind` is a schema type name, not a sentence anyone can act on.
     */
    describe('CastError branch', () => {
        it('answers 422, the status the affected endpoints document', () => {
            const [status] = databaseErrorInterpreter(makeCastError());

            expect(status).toBe(422);
        });

        it('never yields NaN, which Express turns into a 500 when passed to res.status()', () => {
            const [status] = databaseErrorInterpreter(makeCastError());

            expect(Number.isNaN(status)).toBe(false);
        });

        it('does not leak the schema type name as the message', () => {
            // `kind` is 'ObjectId' — internal detail describing how ids are built, and not a
            // sentence anyone can act on.
            const [, message] = databaseErrorInterpreter(makeCastError());

            expect(message).not.toBe('ObjectId');
        });

        it('ignores any number that happens to lead the prose message', () => {
            // The old branch read the status out of the message text, so a Mongoose message
            // starting with a number silently became the HTTP status.
            const castError = Object.assign(new Error('404 not castable'), {
                kind: 'ObjectId'
            }) as unknown as CastError;

            expect(databaseErrorInterpreter(castError)).toEqual([422, 'Invalid identifier']);
        });
    });
});

/** Express response stub with a chainable status().json(). */

/** A driver duplicate-key error: the numeric `code` is the discriminator, never the message. */
const makeDuplicateKeyError = () =>
    Object.assign(
        new Error('E11000 duplicate key error collection: app.users index: users_email'),
        {
            code: 11_000
        }
    );

/** A BSONError-shaped object: identified by `name`, and carrying no `kind`. */
const makeBsonError = () =>
    Object.assign(new Error('input must be a 24 character hex string, 12 byte Uint8Array'), {
        name: 'BSONError'
    });

describe('isDuplicateKey', () => {
    it('recognises the driver code', () => {
        expect(isDuplicateKey(makeDuplicateKeyError())).toBe(true);
    });

    it('reads the code, not the message', () => {
        // E11000's text names the index and the duplicated value, so matching on it would break
        // the first time an index is renamed — and would match a message that merely quotes it.
        expect(isDuplicateKey(new Error('E11000 duplicate key error'))).toBe(false);
    });

    it('is false for an ordinary error, and for nothing at all', () => {
        expect(isDuplicateKey(new Error('connection reset'))).toBe(false);
        expect(isDuplicateKey(undefined)).toBe(false);
    });

    it('does not treat a near-miss code as a duplicate', () => {
        expect(isDuplicateKey(Object.assign(new Error('x'), { code: 11_001 }))).toBe(false);
    });
});

describe('duplicate-key branch', () => {
    it('answers 409, which is what makes `unique: true` safe to declare', () => {
        // Without this branch, closing the signup race converts a duplicate account into a 500 —
        // trading a data bug for an availability bug.
        expect(databaseErrorInterpreter(makeDuplicateKeyError())).toEqual([409, 'Already exists']);
    });

    it('does not echo the driver message, which contains user data', () => {
        // E11000's text carries the duplicated value — an email address, on the index that
        // produces this in practice.
        const [, message] = databaseErrorInterpreter(makeDuplicateKeyError());

        expect(message).not.toContain('users_email');
        expect(message).not.toContain('E11000');
    });
});

describe('BSONError branch', () => {
    it('answers 422 rather than falling through to the catch-all 500', () => {
        // Without this branch the case is reachable WITHOUT A TOKEN: `POST /products/search` is
        // public and takes an `id` filter, so `{"id": ""}` produces a server error.
        //
        // The fixture is a plain Error carrying `name: 'BSONError'`, and that is the contract:
        // the branch matches on the NAME, never on `instanceof`. `bson` arrives as a transitive
        // dependency of two different packages, so an identity check against the wrong copy
        // returns false and the branch goes dead with nothing to show for it.
        expect(databaseErrorInterpreter(makeBsonError())).toEqual([422, 'Invalid identifier']);
    });

    it('does not leak how ids are encoded', () => {
        const [, message] = databaseErrorInterpreter(makeBsonError());

        expect(message).not.toContain('24 character hex');
    });
});

describe('rejectDatabaseError', () => {
    it('sends the status the interpreter chose, not a hardcoded 500', () => {
        const response = makeResponseStub();

        rejectDatabaseError(response, 'getProducts', makeBsonError());

        expect(response.status).toHaveBeenCalledWith(422);
    });

    it('answers with the status-derived message, naming neither the handler nor the driver', () => {
        const response = makeResponseStub();

        rejectDatabaseError(response, 'getProducts', makeBsonError());

        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Unprocessable Entity' })
        );
    });

    it('logs the operation and the interpreter detail, which the response no longer carries', () => {
        /*
         * The detail is not dropped, it is relocated. Both halves are developer-facing — the
         * operation name is internal layout, the detail describes the driver — and the log line is
         * where an operator can act on them and a stranger cannot. This is what makes it safe for
         * the response body above to say only 'Unprocessable Entity'.
         */
        const response = makeResponseStub();

        rejectDatabaseError(response, 'getProducts', makeBsonError());

        expect(mockedLogger.error).toHaveBeenCalledWith('getProducts - Invalid identifier', {
            status: 422
        });
    });

    it('keeps a 5xx driver message out of the response entirely', () => {
        // A 5xx detail describes internals: free reconnaissance in a body, useful in a log.
        const response = makeResponseStub();

        rejectDatabaseError(response, 'getProducts', new Error('connection reset to shard-02'));

        expect(response.status).toHaveBeenCalledWith(500);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Internal Server Error' })
        );
        expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('shard-02');
        expect(mockedLogger.error).toHaveBeenCalledWith(
            'getProducts - connection reset to shard-02',
            { status: 500 }
        );
    });

    it('never puts the driver message in the user-facing errors array', () => {
        // `errors[]` is the translated, user-facing array by this repo's convention. The
        // driver's prose is neither.
        const response = makeResponseStub();

        rejectDatabaseError(response, 'getProducts', new Error('connection reset to shard-02'));

        const body = response.json.mock.calls[0]![0] as { errors: unknown[] };
        expect(JSON.stringify(body.errors)).not.toContain('shard-02');
    });
});

describe('rejectDatabaseEnvelope', () => {
    /*
     * The counterpart for services, which report failure by RETURNING an envelope and so have no
     * `Response` to send. Without it, six `.catch` handlers each re-derived the status inline and
     * spread the interpreter's tuple into the envelope, dropping the detail on the floor.
     */
    it('derives the status the interpreter chose', () => {
        expect(rejectDatabaseEnvelope('login', makeBsonError()).status).toBe(422);
    });

    it('collapses an unrecognised failure to 500', () => {
        expect(rejectDatabaseEnvelope('login', new Error('connection reset')).status).toBe(500);
    });

    it('logs the operation and the interpreter detail, with the status as metadata', () => {
        // The half a `Response`-less caller would otherwise lose: this is the only record that the
        // failure happened at all, and the only place the driver's own words are kept.
        rejectDatabaseEnvelope('login', makeBsonError());

        expect(mockedLogger.error).toHaveBeenCalledWith('login - Invalid identifier', {
            status: 422
        });
    });

    it('keeps the driver message out of the envelope entirely', () => {
        const envelope = rejectDatabaseEnvelope('cart', new Error('connection reset to shard-02'));

        expect(JSON.stringify(envelope)).not.toContain('shard-02');
        expect(envelope.message).toBe('Internal Server Error');
    });
});
