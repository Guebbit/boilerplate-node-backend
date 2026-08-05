/**
 * HTTP error types — `src/core/http/errors.ts`.
 *
 * Two units with quite different risk profiles:
 *
 *   `ExtendedError` — carries the HTTP status alongside the failure and decides, via
 *   `isOperational`, whether the failure is a business outcome or a bug worth logging. Getting
 *   the default wrong in either direction is costly: log everything and a wrong password becomes
 *   an incident; log nothing and a real bug disappears if a caller swallows the throw.
 *
 *   `databaseErrorInterpreter` — maps a Mongoose error onto a `[httpCode, message]` tuple. Its
 *   CastError branch has a **known defect**, documented in the module's own CAVEAT: it reads the
 *   status from `.message` and the message from `.kind`, i.e. the two are swapped. The tests
 *   below pin that behaviour deliberately and are named so, because the source comment says
 *   callers may already depend on the current shape — see the `KNOWN DEFECT` block.
 */

import { ExtendedError, databaseErrorInterpreter } from '@core/http/errors';
import { logger } from '@core/adapters/logger';
import type { CastError } from 'mongoose';

jest.mock('@core/adapters/logger', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    logger: {
        log: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

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
     * KNOWN DEFECT — pinned, not endorsed.
     *
     * The CastError branch returns `[Number.parseInt(error.message), error.kind]`. Since `.message`
     * is prose ('Cast to ObjectId failed for value ...'), `parseInt` yields NaN, and `.kind` is a
     * schema type name ('ObjectId'), not a message. So a malformed ObjectId in a URL produces a
     * status of NaN and a message of 'ObjectId'.
     *
     * These tests assert what the code does today because the module's CAVEAT states the shape is
     * deliberate-for-now ("callers may already depend on the current shape"). They are written to
     * FAIL the moment someone fixes the swap — which is the point: the fix should be a conscious
     * change to this file, not a silent one. See the accompanying report for the suggested fix.
     */
    describe('CastError branch (known defect — see module CAVEAT)', () => {
        /** A CastError-shaped object: `kind` as an own property is the discriminator. */
        const makeCastError = (): CastError =>
            Object.assign(new Error('Cast to ObjectId failed for value "abc" at path "_id"'), {
                kind: 'ObjectId',
                path: '_id',
                value: 'abc'
            }) as unknown as CastError;

        it('yields NaN as the status, because it parses the prose message', () => {
            const [status] = databaseErrorInterpreter(makeCastError());

            expect(Number.isNaN(status)).toBe(true);
        });

        it('yields the schema type name as the message, because it returns `kind`', () => {
            const [, message] = databaseErrorInterpreter(makeCastError());

            expect(message).toBe('ObjectId');
        });

        it('parses a leading integer when the message happens to start with one', () => {
            // Demonstrates the mechanism rather than a realistic Mongoose message: whatever
            // number the prose starts with becomes the HTTP status.
            const castError = Object.assign(new Error('404 not castable'), {
                kind: 'ObjectId'
            }) as unknown as CastError;

            expect(databaseErrorInterpreter(castError)).toEqual([404, 'ObjectId']);
        });
    });
});
