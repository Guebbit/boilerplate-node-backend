/**
 * Express object stubs for unit tests.
 *
 * ── When to reach for these, and when not to ─────────────────────────────────────────────────
 * Use them when the unit under test WRITES a response — a middleware, an error responder, a
 * controller's rejection path. The assertion is then about what reached `status()`/`json()`, and
 * a stub is the only way to see that without a server.
 *
 * Do NOT use them to test a whole endpoint. A stub answers "what did this function try to send",
 * never "what does the API actually return" — it skips routing, the middleware chain, auth,
 * serialization and the global error handler, every one of which can change the answer. That
 * question belongs to `tests/support/http.ts`, which drives the real app over supertest.
 *
 * ── Why the mock returns itself ──────────────────────────────────────────────────────────────
 * Express's response API is a fluent chain: `response.status(404).json(body)`. A bare `jest.fn()`
 * returns `undefined`, so the `.json(...)` half throws before it can record anything, and the
 * failure looks like a bug in the code under test rather than in the fixture. Both methods are
 * therefore wired to return the response object.
 *
 * ── Why assertions read the mock, not a captured value ───────────────────────────────────────
 * Keeping `jest.Mock` on the returned type is deliberate: it lets a test assert on call ORDER and
 * call COUNT, not just the final payload. "Answered 422 once" and "answered 200 then 422" are
 * different bugs, and only the mock can tell them apart.
 */
import { asStub } from './stub';
import type { Response } from 'express';

/** A `Response` whose `status`/`json`/`setHeader` are jest mocks, so tests can assert on what was sent. */
export type ResponseStub = Response & {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
    hasHeader: jest.Mock;
};

/**
 * A chainable Express response stub.
 *
 * @returns a `Response` whose `status()` and `json()` record their arguments and return the
 *          response itself, so `status(...).json(...)` works as it does in production code
 */
export const makeResponseStub = (): ResponseStub => {
    // Header names set so far, lower-cased as Express compares them: `rejectResponse` asks
    // `hasHeader` before it adds the default 401 challenge, so the stub has to answer truthfully.
    const headers = new Set<string>();
    const response = asStub<ResponseStub>({
        status: jest.fn(),
        json: jest.fn(),
        setHeader: jest.fn((name: string) => {
            headers.add(name.toLowerCase());
        }),
        hasHeader: jest.fn((name: string) => headers.has(name.toLowerCase()))
    });

    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);

    return response;
};
