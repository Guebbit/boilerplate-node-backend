/**
 * Request parsing helpers.
 *
 * Written because the first mutation run scored this file 0% — every mutant survived, since no
 * unit test called it at all. It was exercised only through the integration and contract suites,
 * which is precisely how a helper this small ends up with a crash in it.
 *
 * That crash is the first test in `extractCustomId` below: express 5 leaves `request.body`
 * **undefined** when the request carries no body (express 4 defaulted it to `{}`), and the helper
 * read a property off it unconditionally. A body-less `DELETE /cart/:productId` — what the
 * frontend actually sends — answered 500.
 */
import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import {
    extractPagination,
    extractId,
    mergeBodyQuery,
    extractRequestPagination,
    extractAndValidateId,
    extractCustomId,
    isValidObjectId
} from '@core/http/request';

/** A valid 24-hex ObjectId, used wherever the format has to pass. */
const OBJECT_ID = '65dc8a99604c307b702b5ccc';

/** Minimal express Request stand-in: only the fields these helpers read. */
const makeRequest = (
    overrides: { params?: Record<string, unknown>; body?: unknown; query?: unknown } = {}
) =>
    ({
        params: overrides.params ?? {},
        body: overrides.body,
        query: overrides.query ?? {}
    }) as unknown as Request<ParamsDictionary>;

/** Response stand-in capturing the status/payload `rejectResponse` writes. */
const makeResponse = () => {
    const sent: { status?: number; payload?: unknown } = {};
    const response = {
        status(code: number) {
            sent.status = code;
            return this;
        },
        json(payload: unknown) {
            sent.payload = payload;
            return this;
        }
    } as unknown as Response;
    return { response, sent };
};

describe('extractPagination', () => {
    const originalPageSize = process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;

    afterEach(() => {
        if (originalPageSize === undefined) delete process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;
        else process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = originalPageSize;
    });

    it('coerces string parameters to numbers', () => {
        expect(extractPagination({ page: '2', pageSize: '25' })).toEqual({ page: 2, pageSize: 25 });
    });

    it('leaves both undefined when nothing was asked for', () => {
        delete process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;

        expect(extractPagination()).toEqual({ page: undefined, pageSize: undefined });
    });

    // Deliberate: the data layer has to tell "client asked for page 1" apart from
    // "client did not paginate", so an empty or zero value must not become a number.
    it('collapses empty strings and zero to undefined rather than 0', () => {
        delete process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE;

        expect(extractPagination({ page: '', pageSize: 0 })).toEqual({
            page: undefined,
            pageSize: undefined
        });
    });

    it('falls back to the env page size when the caller gives none', () => {
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = '15';

        expect(extractPagination({ page: 1 }).pageSize).toBe(15);
    });

    it('prefers an explicit page size over the env fallback', () => {
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE = '15';

        expect(extractPagination({ pageSize: 50 }).pageSize).toBe(50);
    });
});

describe('extractId', () => {
    it('returns the first defined non-empty candidate, in argument order', () => {
        expect(extractId(undefined, 'from-body', 'from-query')).toBe('from-body');
        expect(extractId('from-param', 'from-body')).toBe('from-param');
    });

    it('skips empty strings, which are not usable ids', () => {
        expect(extractId('', 'from-body')).toBe('from-body');
    });

    it('returns undefined when every candidate is empty', () => {
        expect(extractId(undefined, '')).toBeUndefined();
    });
});

describe('mergeBodyQuery', () => {
    it('lets the body win over the query on conflict', () => {
        expect(mergeBodyQuery({ text: 'body' }, { text: 'query' })).toEqual({ text: 'body' });
    });

    it('keeps query-only keys', () => {
        expect(mergeBodyQuery({ text: 'body' }, { email: 'a@b.c' } as never)).toEqual({
            text: 'body',
            email: 'a@b.c'
        });
    });

    // A spread keeps keys whose value is undefined, and Mongoose would read such a key as a
    // `field: undefined` filter clause instead of ignoring it.
    it('drops keys whose value is explicitly undefined', () => {
        expect(mergeBodyQuery({ text: undefined }, { text: 'query' })).toEqual({});
        expect(Object.keys(mergeBodyQuery({ text: undefined }, {}))).toHaveLength(0);
    });

    it('handles both sides being absent', () => {
        // eslint-disable-next-line unicorn/no-useless-undefined -- absent sources are the case
        expect(mergeBodyQuery(undefined, undefined)).toEqual({});
    });
});

describe('extractRequestPagination', () => {
    it('reads pagination from the body', () => {
        const request = makeRequest({ body: { page: '3', pageSize: '5' } });

        expect(extractRequestPagination(request)).toEqual({ page: 3, pageSize: 5 });
    });

    it('reads pagination from the query when the body has none', () => {
        const request = makeRequest({ query: { page: '4', pageSize: '5' } });

        expect(extractRequestPagination(request)).toEqual({ page: 4, pageSize: 5 });
    });

    it('survives a request with no body at all', () => {
        const request = makeRequest({ query: { page: '1', pageSize: '10' } });

        expect(() => extractRequestPagination(request)).not.toThrow();
    });
});

describe('isValidObjectId', () => {
    it('accepts a well-formed ObjectId', () => {
        expect(isValidObjectId(OBJECT_ID)).toBe(true);
    });

    it('rejects undefined, empty and malformed values', () => {
        // eslint-disable-next-line unicorn/no-useless-undefined -- the argument is the point
        expect(isValidObjectId(undefined)).toBe(false);
        expect(isValidObjectId('')).toBe(false);
        expect(isValidObjectId('not-an-id')).toBe(false);
    });
});

describe('extractAndValidateId', () => {
    it('returns the id from the route param', () => {
        const { response } = makeResponse();
        const request = makeRequest({ params: { id: OBJECT_ID } });

        expect(extractAndValidateId(request, response, 'Product')).toBe(OBJECT_ID);
    });

    it('falls back to the body when there is no route param', () => {
        const { response } = makeResponse();
        const request = makeRequest({ body: { id: OBJECT_ID } });

        expect(extractAndValidateId(request, response, 'Product')).toBe(OBJECT_ID);
    });

    it('answers 422 for a malformed id instead of letting Mongoose throw a 500', () => {
        const { response, sent } = makeResponse();
        const request = makeRequest({ params: { id: 'not-an-id' } });

        expect(extractAndValidateId(request, response, 'Product')).toBeUndefined();
        expect(sent.status).toBe(422);
    });

    it('answers 422, not 500, when the request has no body and no param', () => {
        const { response, sent } = makeResponse();
        const request = makeRequest();

        expect(extractAndValidateId(request, response, 'Product')).toBeUndefined();
        expect(sent.status).toBe(422);
    });
});

describe('extractCustomId', () => {
    // The regression: express 5 gives `undefined` for a body-less request, and this helper
    // reads the body key before the param/body precedence is applied.
    it('reads the route param when the request has no body at all', () => {
        const request = makeRequest({ params: { productId: OBJECT_ID } });

        expect(extractCustomId(request, { param: 'productId', body: 'productId' })).toBe(OBJECT_ID);
    });

    it('prefers the param over the body', () => {
        const request = makeRequest({
            params: { productId: OBJECT_ID },
            body: { productId: 'from-body' }
        });

        expect(extractCustomId(request, { param: 'productId', body: 'productId' })).toBe(OBJECT_ID);
    });

    it('falls back to the body when the param is absent', () => {
        const request = makeRequest({ body: { productId: OBJECT_ID } });

        expect(extractCustomId(request, { param: 'productId', body: 'productId' })).toBe(OBJECT_ID);
    });

    it('takes the first entry when a repeated key arrives as an array', () => {
        const request = makeRequest({ body: { productId: [OBJECT_ID, 'second'] } });

        expect(extractCustomId(request, { body: 'productId' })).toBe(OBJECT_ID);
    });

    it('returns undefined when neither source carries the field', () => {
        const request = makeRequest({ params: {}, body: {} });

        expect(extractCustomId(request, { param: 'productId', body: 'productId' })).toBeUndefined();
    });

    it('returns undefined when no fields are requested at all', () => {
        expect(extractCustomId(makeRequest())).toBeUndefined();
    });
});
