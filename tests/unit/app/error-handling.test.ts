/**
 * `handleUncaughtError` — driven directly, per its own docblock ("exported so it can be driven
 * directly"), rather than through a throwing route: the property under test is `resolveStatus`'s
 * own branching, which needs no HTTP layer at all.
 *
 * `tests/integration/auth-hardening.test.ts` already covers the express-level property that a
 * synchronous throw actually reaches this handler, and the genuine body-parser rejections (their
 * own `.status`, real `expose`). This file is the narrower one: what `clientErrorStatus` does
 * with the two fields a thrown error may carry.
 */

import type { NextFunction, Request } from 'express';
import { asStub } from '@tests/stub';
import { makeResponseStub } from '@tests/express';
import { logger } from '@infrastructure/adapters/logger';
import { handleUncaughtError } from '@app/error-handling';

/** Enough of a `Request` for the one field the handler reads: `requestId`, for the log line. */
const requestStub = () => asStub<Request>({ requestId: 'req-1', path: '/x', method: 'GET' });

const NEXT: NextFunction = jest.fn();

describe('handleUncaughtError', () => {
    it('reads a client status from statusCode when status is absent', () => {
        // http-errors sets both `.status` and `.statusCode`, but a thrower that follows only the
        // Node convention (`.statusCode`, no `.status`) still declares itself a client error --
        // `clientErrorStatus`'s own fallback, uncovered until now.
        const error = Object.assign(new Error('bad range'), { expose: true, statusCode: 416 });

        const response = makeResponseStub();
        handleUncaughtError(error, requestStub(), response, NEXT);

        expect(response.status).toHaveBeenCalledWith(416);
    });

    it('prefers status over statusCode when an error carries both', () => {
        const error = Object.assign(new Error('conflicting'), {
            expose: true,
            status: 409,
            statusCode: 416
        });

        const response = makeResponseStub();
        handleUncaughtError(error, requestStub(), response, NEXT);

        expect(response.status).toHaveBeenCalledWith(409);
    });

    it('falls through to the database interpreter when neither field is a valid 4xx', () => {
        // statusCode present but out of the 4xx range clientErrorStatus accepts -- resolveStatus
        // must not treat it as a declared client error.
        const error = Object.assign(new Error('boom'), { expose: true, statusCode: 599 });

        const response = makeResponseStub();
        handleUncaughtError(error, requestStub(), response, NEXT);

        expect(response.status).toHaveBeenCalledWith(500);
    });

    it('hands a mid-stream error to Express, which closes the connection', () => {
        const error = new Error('stream broke');
        const response = Object.assign(makeResponseStub(), { headersSent: true });
        const next = jest.fn();

        handleUncaughtError(error, requestStub(), response, next);

        expect(next).toHaveBeenCalledWith(error);
        expect(response.status).not.toHaveBeenCalled();
    });

    // A DB/Redis outage answers 503 (RFC 9110 §15.6.4), not the generic 500 every other
    // server-side failure gets — the whole point being that a client can tell "retry shortly"
    // apart from "something is broken".
    describe('a Mongo/Redis outage (the databaseErrorInterpreter 503 branch)', () => {
        const outage = Object.assign(new Error('server selection timed out'), {
            name: 'MongoServerSelectionError'
        });

        /** `setHeader` is the one extra call this branch makes, beyond `status`/`json`. */
        const responseWithHeaders = () =>
            Object.assign(makeResponseStub(), { setHeader: jest.fn() });

        it('answers 503, not 500', () => {
            const response = responseWithHeaders();

            handleUncaughtError(outage, requestStub(), response, NEXT);

            expect(response.status).toHaveBeenCalledWith(503);
        });

        it('sets Retry-After as a hint for the client', () => {
            const response = responseWithHeaders();

            handleUncaughtError(outage, requestStub(), response, NEXT);

            expect(response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
        });

        it('does not leak the driver message into the body', () => {
            const response = responseWithHeaders();

            handleUncaughtError(outage, requestStub(), response, NEXT);

            expect(JSON.stringify(response.json.mock.calls[0]![0])).not.toContain(
                'server selection'
            );
        });
    });
});

describe('handleUncaughtError log level', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('logs a client error at warn, not error', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);

        handleUncaughtError(
            Object.assign(new Error('duplicate'), { expose: true, status: 409 }),
            requestStub(),
            makeResponseStub(),
            NEXT
        );

        expect(warn).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
    });

    it('logs a server error at error', () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
        const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);

        handleUncaughtError(new Error('boom'), requestStub(), makeResponseStub(), NEXT);

        expect(error).toHaveBeenCalledTimes(1);
        expect(warn).not.toHaveBeenCalled();
    });
});
