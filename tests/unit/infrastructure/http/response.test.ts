/**
 * Response envelope — `src/infrastructure/http/response.ts`.
 *
 * Every endpoint answers in this shape, so the rules encoded here are the API's public dialect
 * rather than an implementation detail:
 *
 *   **`errors` is never empty on a failure.** A reject with `errors: []` forces every client to
 *   special-case it, so a fallback item is synthesised. That guarantee is asserted from several
 *   directions because it is the one a well-meaning simplification would drop.
 *
 *   **`code` is what clients branch on, `message` is what they display.** The status → code map
 *   is therefore pinned per status, including the two catch-alls: any unmapped 4xx collapses to
 *   `REQUEST_ERROR`, and every 5xx collapses to `INTERNAL_ERROR` so the flavour of a server
 *   failure cannot leak.
 *
 *   **Status is written twice** — HTTP status and body — specifically so the two cannot disagree.
 */

import {
    generateReject,
    generateSuccess,
    resolveErrorMessage,
    successResponse,
    rejectResponse
} from '@infrastructure/http/response';
import { makeResponseStub } from '@tests/express';

/** Express response stub with a chainable status().json(). */

describe('generateSuccess', () => {
    it('returns plain objects unchanged (no implicit Mongo normalization)', () => {
        const responseData = { _id: '507f1f77bcf86cd799439011', title: 'Keyboard' };
        Reflect.set(responseData, '__v', 3);
        const response = generateSuccess(responseData);

        expect(response.data).toEqual(responseData);
    });

    it('keeps primitives untouched', () => {
        const response = generateSuccess('ok');
        expect(response.data).toBe('ok');
    });

    it('defaults to status 200 and an empty message', () => {
        const response = generateSuccess({ id: 'x' });

        expect(response.success).toBe(true);
        expect(response.status).toBe(200);
        expect(response.message).toBe('');
    });

    it('honours an explicit status and message', () => {
        const response = generateSuccess({ id: 'x' }, 201, 'Created');

        expect(response.status).toBe(201);
        expect(response.message).toBe('Created');
    });

    it('carries no errors key at runtime', () => {
        // `errors: never` exists only to drive type narrowing; emitting the key would put an
        // `errors` field on every successful response.
        const response = generateSuccess({ id: 'x' });

        expect(Object.keys(response).toSorted()).toEqual(['data', 'message', 'status', 'success']);
    });

    it('preserves undefined data rather than dropping the key', () => {
        const response = generateSuccess(undefined);

        expect(response).toHaveProperty('data');
        expect(response.data).toBeUndefined();
    });
});

/** The `code` a given status maps to — the single fact every status test below asserts. */
const codeFor = (status: number) => generateReject(status, ['y']).errors[0].code;

describe('generateReject', () => {
    it('builds structured error items from plain string errors', () => {
        const response = generateReject(400, ['Field is required']);

        expect(response).toEqual({
            success: false,
            status: 400,
            message: 'Bad Request',
            data: undefined,
            errors: [
                {
                    code: 'BAD_REQUEST',
                    message: 'Field is required'
                }
            ]
        });
    });

    it('preserves provided structured error items', () => {
        const response = generateReject(422, [
            {
                code: 'VALIDATION_ERROR',
                message: 'Invalid email format',
                details: { field: 'email' }
            }
        ]);

        expect(response.errors).toEqual([
            {
                code: 'VALIDATION_ERROR',
                message: 'Invalid email format',
                details: { field: 'email' }
            }
        ]);
    });

    it('defaults to status 400 with a generic message', () => {
        // 400 is "a safer accidental default than 500" — an unannotated reject must not report
        // a server fault for what is usually a client one.
        const response = generateReject();

        expect(response.status).toBe(400);
        expect(response.message).toBe('Bad Request');
        expect(response.errors).toEqual([{ code: 'BAD_REQUEST', message: 'Bad Request' }]);
    });

    it('synthesises an item when no errors are supplied', () => {
        const response = generateReject(404);

        expect(response.errors).toEqual([{ code: 'NOT_FOUND', message: 'Not Found' }]);
    });

    /*
     * The one convention: callers cannot pass a message, so a given status always reads the same
     * way, rather than a bare 'Not Found' next to an operation-prefixed
     * 'getProductItem - not found' whose prefix leaks the handler layout into every 404.
     *
     * Every mapped status is asserted, and the two catch-alls with it. Partial coverage here is
     * worse than none: an unasserted branch is a wording nobody has ever read, in a field that
     * reaches the client on every failure.
     */
    it.each([
        [400, 'Bad Request'],
        [401, 'Unauthorized'],
        [403, 'Forbidden'],
        [404, 'Not Found'],
        [409, 'Conflict'],
        [422, 'Unprocessable Entity'],
        [429, 'Too Many Requests'],
        [500, 'Internal Server Error'],
        [502, 'Internal Server Error'],
        [418, 'Request Error'],
        [499, 'Request Error']
    ])('%i reads as %s', (status, message) => {
        expect(generateReject(status).message).toBe(message);
        expect(resolveErrorMessage(status)).toBe(message);
    });

    it('uses the same wording whatever the caller passed as errors', () => {
        expect(generateReject(404, ['anything']).message).toBe(generateReject(404).message);
    });

    it('falls back to the status wording for the synthesised error item too', () => {
        // `normalizeErrors` reuses it when `errors` is empty, so the two cannot drift apart.
        expect(generateReject(429).errors).toEqual([
            { code: 'REQUEST_ERROR', message: 'Too Many Requests' }
        ]);
    });

    it('always carries a present-but-undefined data key', () => {
        // Explicitly present so `result.data` type-checks on both branches of the union.
        const response = generateReject(404);

        expect(response).toHaveProperty('data');
        expect(response.data).toBeUndefined();
    });

    it('maps each status to its own stable code', () => {
        // Clients branch on `code`, never on `message`. Distinct statuses must not collapse.

        expect(codeFor(400)).toBe('BAD_REQUEST');
        expect(codeFor(401)).toBe('UNAUTHORIZED');
        expect(codeFor(403)).toBe('FORBIDDEN');
        expect(codeFor(404)).toBe('NOT_FOUND');
        expect(codeFor(409)).toBe('CONFLICT');
    });

    it('collapses any 5xx to a single internal code', () => {
        expect(codeFor(500)).toBe('INTERNAL_ERROR');
        expect(codeFor(502)).toBe('INTERNAL_ERROR');
        expect(codeFor(599)).toBe('INTERNAL_ERROR');
    });

    it('treats 499 as a client error, not a server one', () => {
        // The `>= 500` boundary from below. With `> 500`, a plain 500 would fall through to
        // REQUEST_ERROR and clients would stop recognising server failures.
        expect(generateReject(499, ['y']).errors[0].code).toBe('REQUEST_ERROR');
    });

    it('falls back to REQUEST_ERROR for unmapped 4xx statuses', () => {
        expect(codeFor(422)).toBe('REQUEST_ERROR');
        expect(codeFor(429)).toBe('REQUEST_ERROR');
    });

    it('normalises a mixed list of strings and structured items', () => {
        const response = generateReject(422, [
            'Email is required',
            { code: 'TOO_SHORT', message: 'Password too short' }
        ]);

        expect(response.errors).toEqual([
            { code: 'REQUEST_ERROR', message: 'Email is required' },
            { code: 'TOO_SHORT', message: 'Password too short' }
        ]);
    });

    it('fills a structured item missing its code from the status', () => {
        const response = generateReject(409, [{ code: '', message: 'Email already used' }]);

        expect(response.errors[0].code).toBe('CONFLICT');
    });

    it('fills a structured item missing its message from the envelope message', () => {
        const response = generateReject(409, [{ code: 'DUPLICATE', message: '' }]);

        expect(response.errors[0]).toEqual({ code: 'DUPLICATE', message: 'Conflict' });
    });

    it('omits details entirely rather than serialising it as undefined', () => {
        // A `"details": undefined` key survives some serialisers as `null` and shows up in
        // contract validation as an undeclared field.
        const response = generateReject(422, [{ code: 'X', message: 'Y' }]);

        expect(response.errors[0]).not.toHaveProperty('details');
    });

    it('keeps details when provided', () => {
        const response = generateReject(422, [
            { code: 'X', message: 'Y', details: { field: 'email' } }
        ]);

        expect(response.errors[0].details).toEqual({ field: 'email' });
    });
});

describe('successResponse', () => {
    it('applies the same status to the HTTP response and the body', () => {
        const response = makeResponseStub();

        successResponse(response, { id: 'x' }, 201, 'Created');

        // Written twice on purpose, so the two can never disagree — a proxy that rewrites the
        // HTTP status still leaves the body's copy intact.
        expect(response.status).toHaveBeenCalledWith(201);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: true, status: 201, message: 'Created' })
        );
    });

    it('defaults to 200', () => {
        const response = makeResponseStub();

        successResponse(response, { id: 'x' });

        expect(response.status).toHaveBeenCalledWith(200);
    });
});

describe('rejectResponse', () => {
    it('applies the same status to the HTTP response and the body', () => {
        const response = makeResponseStub();

        rejectResponse(response, 404, ['No such product']);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            status: 404,
            message: 'Not Found',
            data: undefined,
            errors: [{ code: 'NOT_FOUND', message: 'No such product' }]
        });
    });

    it('defaults to 400', () => {
        const response = makeResponseStub();

        rejectResponse(response);

        expect(response.status).toHaveBeenCalledWith(400);
    });

    it('does not throw, so controllers must return it', () => {
        // Documented: forgetting the `return` lets execution continue and trips Express'
        // "headers already sent". Pinned so the contract cannot change silently.
        const response = makeResponseStub();

        expect(() => rejectResponse(response, 500)).not.toThrow();
    });
});
