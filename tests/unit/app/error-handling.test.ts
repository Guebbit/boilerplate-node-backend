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
});
