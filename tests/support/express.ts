/**
 * Express object stubs for unit tests.
 *
 * Use when:  the unit under test WRITES a response (a middleware, an error responder, a
 *            controller's rejection path) and the assertion is what reached `status()`/`json()`.
 * Do not:    test a whole endpoint with them. A stub answers "what did this function try to
 *            send", never "what does the API return": it skips routing, the middleware chain,
 *            auth, serialization and the global error handler. That is `tests/support/http.ts`,
 *            which drives the real app over supertest.
 * Chaining:  Express's response API is fluent (`response.status(404).json(body)`). A bare
 *            `jest.fn()` returns `undefined`, so `.json(...)` throws before recording and the
 *            failure reads as a bug in the code under test. Both methods return the response.
 * Mocks:     `jest.Mock` stays on the returned type so a test can assert call ORDER and COUNT:
 *            "answered 422 once" and "answered 200 then 422" are different bugs.
 */
import { asStub } from './stub';
import type { Response } from 'express';

/** A `Response` whose `status`/`json`/`setHeader` are jest mocks, so tests can assert on what was sent. */
export type ResponseStub = Response & {
    status: jest.Mock;
    json: jest.Mock;
    end: jest.Mock;
    setHeader: jest.Mock;
    hasHeader: jest.Mock;
    getHeader: jest.Mock;
    removeHeader: jest.Mock;
    vary: jest.Mock;
};

/**
 * A chainable Express response stub.
 *
 * @returns a `Response` whose `status()` and `json()` record their arguments and return the
 *          response itself, so `status(...).json(...)` works as it does in production code
 */
export const makeResponseStub = (): ResponseStub => {
    /**
     * Headers set so far, names lower-cased as Express compares them: `rejectResponse` asks
     * `hasHeader` before it adds a default challenge and reads `x-request-id`, so the stub has to answer truthfully.
     */
    const headers = new Map<string, unknown>();
    const response = asStub<ResponseStub>({
        status: jest.fn(),
        json: jest.fn(),
        end: jest.fn(),
        setHeader: jest.fn((name: string, value: unknown) => {
            headers.set(name.toLowerCase(), value);
        }),
        getHeader: jest.fn((name: string) => headers.get(name.toLowerCase())),
        hasHeader: jest.fn((name: string) => headers.has(name.toLowerCase())),
        removeHeader: jest.fn((name: string) => {
            headers.delete(name.toLowerCase());
        }),
        vary: jest.fn()
    });

    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    response.end.mockReturnValue(response);

    return response;
};
