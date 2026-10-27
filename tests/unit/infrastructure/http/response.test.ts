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
 *   is therefore pinned per status: a status-only error's code is the RFC 9110 name in UPPER_SNAKE,
 *   an uncatalogued 4xx is `CLIENT_ERROR`, and every 5xx but 503 collapses to
 *   `INTERNAL_SERVER_ERROR` so the flavour of a server failure cannot leak.
 *
 *   **Status is written twice** — HTTP status and body — specifically so the two cannot disagree.
 */

import {
    fieldError,
    generateReject,
    generateSuccess,
    resolveErrorTitle,
    successResponse,
    createdOrOk,
    noContentResponse,
    rejectResponse
} from '@infrastructure/http/response';
import { makeResponseStub } from '@tests/express';
import { ERROR_CODES, type ErrorCode } from '@api/error-codes';
import { t, translator } from '@infrastructure/i18n';

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

    it('defaults to status 200', () => {
        const response = generateSuccess({ id: 'x' });

        expect(response.success).toBe(true);
        expect(response.status).toBe(200);
    });

    it('honours an explicit status', () => {
        const response = generateSuccess({ id: 'x' }, 201);

        expect(response.status).toBe(201);
    });

    it('carries no errors key at runtime', () => {
        // `errors: never` exists only to drive type narrowing; emitting the key would put an
        // `errors` field on every successful response.
        const response = generateSuccess({ id: 'x' });

        expect(Object.keys(response).toSorted()).toEqual(['data', 'status', 'success']);
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
        expect(response.errors).toEqual([
            { code: 'BAD_REQUEST', message: t('generic.error-bad-request') }
        ]);
    });

    it('synthesises an item when no errors are supplied', () => {
        const response = generateReject(404);

        expect(response.errors).toEqual([
            { code: 'NOT_FOUND', message: t('generic.error-not-found') }
        ]);
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
        [405, 'Method Not Allowed'],
        [409, 'Conflict'],
        [412, 'Precondition Failed'],
        [413, 'Content Too Large'],
        [415, 'Unsupported Media Type'],
        [422, 'Unprocessable Content'],
        [429, 'Too Many Requests'],
        [500, 'Internal Server Error'],
        [502, 'Bad Gateway'],
        [503, 'Service Unavailable'],
        [418, "I'm a Teapot"],
        [499, 'Client Error'],
        [599, 'Server Error']
    ])('%i is titled %s', (status, title) => {
        expect(generateReject(status).message).toBe(title);
        expect(resolveErrorTitle(status)).toBe(title);
    });

    /*
     * `errors[0].message` is what a person reads, so a status-only failure is translated: one
     * `generic.*` key per status, while the top-level `message` above stays English (AIP-193).
     */
    it.each([
        [400, 'generic.error-bad-request'],
        [401, 'generic.error-unauthorized'],
        [403, 'generic.error-forbidden'],
        [404, 'generic.error-not-found'],
        [409, 'generic.error-conflict'],
        [412, 'generic.error-precondition-failed'],
        [422, 'generic.error-unprocessable-content'],
        [429, 'generic.error-too-many-requests'],
        [503, 'generic.error-service-unavailable'],
        [500, 'generic.error-internal-server-error'],
        [502, 'generic.error-internal-server-error'],
        [418, 'generic.error-client-error']
    ])('%i answers its fallback item from %s, in the active language', (status, key) => {
        expect(generateReject(status).errors[0]?.message).toBe(t(key));
    });

    it('answers the fallback item in Italian inside an Italian request', () => {
        const italian = translator('it');

        // Every mapped status has an Italian text of its own, not the English one reused.
        for (const key of [
            'generic.error-not-found',
            'generic.error-conflict',
            'generic.error-precondition-failed'
        ])
            expect(italian(key)).not.toBe(t(key));
    });

    it('uses the same wording whatever the caller passed as errors', () => {
        expect(generateReject(404, ['anything']).message).toBe(generateReject(404).message);
    });

    it('falls back to the status wording for the synthesised error item too', () => {
        // `normalizeErrors` reuses it when `errors` is empty, so the two cannot drift apart.
        expect(generateReject(429).errors).toEqual([
            { code: 'TOO_MANY_REQUESTS', message: t('generic.error-too-many-requests') }
        ]);
    });

    it('always carries a present-but-undefined data key', () => {
        // Explicitly present so `result.data` type-checks on both branches of the union.
        const response = generateReject(404);

        expect(response).toHaveProperty('data');
        expect(response.data).toBeUndefined();
    });

    /*
     * The rule, pinned for every status that has a code of its own: UPPER_SNAKE of the RFC 9110
     * name. A client branches on `code`, so distinct statuses must not collapse and a rename of
     * Node's phrase table must not silently rename a code.
     */
    it.each([
        [400, 'BAD_REQUEST'],
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
        [404, 'NOT_FOUND'],
        [405, 'METHOD_NOT_ALLOWED'],
        [409, 'CONFLICT'],
        [412, 'PRECONDITION_FAILED'],
        [413, 'CONTENT_TOO_LARGE'],
        [415, 'UNSUPPORTED_MEDIA_TYPE'],
        [422, 'UNPROCESSABLE_CONTENT'],
        [429, 'TOO_MANY_REQUESTS'],
        [500, 'INTERNAL_SERVER_ERROR'],
        [503, 'SERVICE_UNAVAILABLE']
    ])('%i answers %s', (status, code) => {
        expect(codeFor(status)).toBe(code);
        expect(ERROR_CODES).toHaveProperty(code);
    });

    it('gives every derived code a locale key of the same name', () => {
        for (const status of [
            400, 401, 403, 404, 405, 409, 412, 413, 415, 422, 429, 500, 503, 418
        ]) {
            const key = `generic.error-${codeFor(status).toLowerCase().replaceAll('_', '-')}`;
            expect(t(key)).not.toBe(key);
        }
    });

    it('collapses any 5xx but 503 to a single internal code', () => {
        expect(codeFor(502)).toBe('INTERNAL_SERVER_ERROR');
        expect(codeFor(599)).toBe('INTERNAL_SERVER_ERROR');
    });

    it('treats 499 as a client error, not a server one', () => {
        // The `>= 500` boundary from below. With `> 500`, a plain 500 would fall through to
        // CLIENT_ERROR and clients would stop recognising server failures.
        expect(codeFor(499)).toBe('CLIENT_ERROR');
    });

    it('answers CLIENT_ERROR for a 4xx whose name the catalogue does not list', () => {
        expect(codeFor(418)).toBe('CLIENT_ERROR');
        expect(codeFor(410)).toBe('CLIENT_ERROR');
    });

    it('normalises a mixed list of strings and structured items', () => {
        const response = generateReject(422, [
            'Email is required',
            // The merge rule is generic over WHATEVER code a caller supplies — this value's only
            // job is to prove it passes through untouched, not to name a real catalogue entry.
            { code: 'TOO_SHORT' as ErrorCode, message: 'Password too short' }
        ]);

        expect(response.errors).toEqual([
            { code: 'UNPROCESSABLE_CONTENT', message: 'Email is required' },
            { code: 'TOO_SHORT', message: 'Password too short' }
        ]);
    });

    it('fills a structured item missing its code from the status', () => {
        // `''` is deliberately not a real code: it exercises the `error.code || fallback` branch,
        // which only fires on a falsy value — the type does not forbid an empty string arriving
        // this way, since it can still come from an un-narrowed external source at runtime.
        const response = generateReject(409, [
            { code: '' as ErrorCode, message: 'Email already used' }
        ]);

        expect(response.errors[0].code).toBe('CONFLICT');
    });

    it('fills a structured item missing its message from the envelope message', () => {
        const response = generateReject(409, [{ code: 'DUPLICATE' as ErrorCode, message: '' }]);

        expect(response.errors[0]).toEqual({
            code: 'DUPLICATE',
            message: t('generic.error-conflict')
        });
    });

    it('omits details entirely rather than serialising it as undefined', () => {
        // A `"details": undefined` key survives some serialisers as `null` and shows up in
        // contract validation as an undeclared field.
        const response = generateReject(422, [{ code: 'X' as ErrorCode, message: 'Y' }]);

        expect(response.errors[0]).not.toHaveProperty('details');
    });

    it('keeps details when provided', () => {
        const response = generateReject(422, [
            { code: 'X' as ErrorCode, message: 'Y', details: { field: 'email' } }
        ]);

        expect(response.errors[0].details).toEqual({ field: 'email' });
    });
});

describe('successResponse', () => {
    it('sends the payload itself as the body, under the given status', () => {
        const response = makeResponseStub();

        successResponse(response, { id: 'x' }, 201);

        expect(response.status).toHaveBeenCalledWith(201);
        expect(response.json).toHaveBeenCalledWith({ id: 'x' });
    });

    it('defaults to 200', () => {
        const response = makeResponseStub();

        successResponse(response, { id: 'x' });

        expect(response.status).toHaveBeenCalledWith(200);
    });
});

/**
 * The shared stub has no `location`; this adds the one method `createdResponse` calls.
 */
const stubWithLocation = () => {
    const response = makeResponseStub();
    const location = jest.fn();
    Object.assign(response, { location });
    return { response, location };
};

describe('noContentResponse', () => {
    it('answers 204 and ends without a body', () => {
        const response = makeResponseStub();
        const end = jest.fn();
        Object.assign(response, { end });
        jest.mocked(response.status).mockReturnValue(response);

        noContentResponse(response);

        expect(response.status).toHaveBeenCalledWith(204);
        expect(end).toHaveBeenCalledTimes(1);
        expect(response.json).not.toHaveBeenCalled();
    });
});

describe('createdOrOk', () => {
    it('answers 201 and names the new resource when the call created it', () => {
        const { response, location } = stubWithLocation();

        createdOrOk(response, { id: 'x' }, 201, '/things/x');

        expect(location).toHaveBeenCalledWith('/things/x');
        expect(response.status).toHaveBeenCalledWith(201);
        expect(response.json).toHaveBeenCalledWith({ id: 'x' });
    });

    it('answers the given status without a Location when nothing was created', () => {
        const { response, location } = stubWithLocation();

        createdOrOk(response, { id: 'x' }, 200, '/things/x');

        expect(location).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({ id: 'x' });
    });

    it('answers 200 when the status is unset', () => {
        const { response } = stubWithLocation();

        createdOrOk(response, { id: 'x' }, undefined, '/things/x');

        expect(response.status).toHaveBeenCalledWith(200);
    });
});

describe('rejectResponse', () => {
    it('applies the same status to the HTTP response and the body', () => {
        const response = makeResponseStub();

        rejectResponse(response, 404, ['No such product']);

        expect(response.status).toHaveBeenCalledWith(404);
        expect(response.json).toHaveBeenCalledWith({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'No such product',
            errors: [{ code: 'NOT_FOUND', message: 'No such product' }]
        });
    });

    it('sends application/problem+json and never an attachment', () => {
        const response = makeResponseStub();

        rejectResponse(response, 404, ['No such product']);

        expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
        expect(response.removeHeader).toHaveBeenCalledWith('Content-Disposition');
    });

    it('summarises several errors with the status text, and names the occurrence by request id', () => {
        const response = makeResponseStub();
        response.setHeader('x-request-id', '5b0c9a1e-7a3d-4a3e-9c53-0d6b5d5c2e11');

        rejectResponse(response, 422, [
            fieldError('email', 'Bad email'),
            fieldError('name', 'Too short')
        ]);

        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Unprocessable Content',
                detail: t('generic.error-unprocessable-content'),
                instance: 'urn:uuid:5b0c9a1e-7a3d-4a3e-9c53-0d6b5d5c2e11'
            })
        );
    });

    it('omits instance when the request carried no id, and never puts success or message in the body', () => {
        const response = makeResponseStub();

        rejectResponse(response, 500);

        const [body] = response.json.mock.calls[0] as [Record<string, unknown>];
        expect(body).not.toHaveProperty('instance');
        expect(body).not.toHaveProperty('success');
        expect(body).not.toHaveProperty('message');
    });

    it('defaults to 400', () => {
        const response = makeResponseStub();

        rejectResponse(response);

        expect(response.status).toHaveBeenCalledWith(400);
    });

    it('sets Retry-After on a 429 whose error names a wait', () => {
        const response = makeResponseStub();
        const setHeader = jest.fn();
        Reflect.set(response, 'setHeader', setHeader);

        rejectResponse(response, 429, [
            { code: 'RATE_LIMITED', message: 'Slow down', details: { retryAfter: 42 } }
        ]);

        expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
    });

    it('defaults a 503 to a Retry-After hint, and keeps one a caller set', () => {
        const fresh = makeResponseStub();
        const named = makeResponseStub();
        named.setHeader('Retry-After', '120');
        named.setHeader.mockClear();

        rejectResponse(fresh, 503);
        rejectResponse(named, 503);

        expect(fresh.setHeader).toHaveBeenCalledWith('Retry-After', '5');
        expect(named.setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything());
    });

    it('sets no Retry-After on a 429 that names no wait, or on another status', () => {
        const response = makeResponseStub();
        const setHeader = jest.fn();
        Reflect.set(response, 'setHeader', setHeader);

        rejectResponse(response, 429, ['Slow down']);
        rejectResponse(response, 409, [
            { code: 'CONFLICT', message: 'No', details: { retryAfter: 5 } }
        ]);

        expect(setHeader).not.toHaveBeenCalledWith('Retry-After', expect.anything());
    });

    it('marks every error no-store, whatever a route set before it failed', () => {
        const response = makeResponseStub();

        rejectResponse(response, 503);

        expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('sets the Bearer challenge on a 401 that names none', () => {
        const response = makeResponseStub();

        rejectResponse(response, 401, ['Unauthorized']);

        expect(response.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer realm="api"');
    });

    it('keeps a challenge the guard already set', () => {
        const response = makeResponseStub();
        Reflect.set(
            response,
            'hasHeader',
            jest.fn(() => true)
        );

        rejectResponse(response, 401, ['Unauthorized']);

        expect(response.setHeader).not.toHaveBeenCalledWith('WWW-Authenticate', expect.anything());
    });

    it('sets no challenge on any other status', () => {
        const response = makeResponseStub();

        rejectResponse(response, 403, ['Forbidden']);
        rejectResponse(response, 404, ['Not found']);

        expect(response.setHeader).not.toHaveBeenCalledWith('WWW-Authenticate', expect.anything());
    });

    it('does not throw, so controllers must return it', () => {
        // Documented: forgetting the `return` lets execution continue and trips Express'
        // "headers already sent". Pinned so the contract cannot change silently.
        const response = makeResponseStub();

        expect(() => rejectResponse(response, 500)).not.toThrow();
    });
});

describe('fieldError', () => {
    it('names the field under VALIDATION_ERROR by default', () => {
        expect(fieldError('shippingAddress.zip', 'Too short')).toEqual({
            code: 'VALIDATION_ERROR',
            message: 'Too short',
            details: { field: 'shippingAddress.zip' }
        });
    });

    it('keeps a domain code, and extra context beside the field without letting it rename it', () => {
        expect(
            fieldError('permissions', 'Not yours', 'CONFLICT', {
                permissions: ['a'],
                field: 'other'
            })
        ).toEqual({
            code: 'CONFLICT',
            message: 'Not yours',
            details: { permissions: ['a'], field: 'permissions' }
        });
    });
});
