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
    mergeBodyQuery,
    extractRequestPagination,
    extractAndValidateId,
    extractCustomId,
    isValidObjectId,
    isMultipartRequest,
    parseFormBoolean,
    decodeFormFields
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

/**
 * Request stub that answers `is()` the way express does: the matched type when the
 * Content-Type matches, `false` when it does not, and `null` when there is no body at all.
 * Both arguments are omittable, which is how a body-less request is expressed.
 */
const makeTypedRequest = (contentType?: string, body?: unknown) =>
    ({
        params: {},
        body,
        query: {},
        is: (type: string) =>
            // eslint-disable-next-line unicorn/no-null -- express really returns null here
            contentType === undefined ? null : contentType === type ? type : false
    }) as unknown as Request<ParamsDictionary>;

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

/*
 * Values come back exactly as sent, uncoerced and unbounded. Defaulting belongs to
 * `normalizePagination` (@repositories/search), which runs on every search — see
 * `tests/unit/repositories/search-pagination.test.ts`.
 */
describe('extractRequestPagination', () => {
    it('reads pagination from the body', () => {
        const request = makeRequest({ body: { page: '3', pageSize: '5' } });

        expect(extractRequestPagination(request)).toEqual({ page: '3', pageSize: '5' });
    });

    it('reads pagination from the query when the body has none', () => {
        const request = makeRequest({ query: { page: '4', pageSize: '5' } });

        expect(extractRequestPagination(request)).toEqual({ page: '4', pageSize: '5' });
    });

    it('reports absent pagination as undefined, not as a default', () => {
        const request = makeRequest();

        expect(extractRequestPagination(request)).toEqual({
            page: undefined,
            pageSize: undefined
        });
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

describe('isMultipartRequest', () => {
    it('is true for a multipart/form-data body', () => {
        expect(isMultipartRequest(makeTypedRequest('multipart/form-data'))).toBe(true);
    });

    it('is false for a JSON body', () => {
        expect(isMultipartRequest(makeTypedRequest('application/json'))).toBe(false);
    });

    // express returns `null`, not `false`, when the request carries no body — a distinction
    // `!!` has to flatten, or a body-less request would be treated as a form.
    it('is false when the request carries no body at all', () => {
        expect(isMultipartRequest(makeTypedRequest())).toBe(false);
    });
});

describe('parseFormBoolean', () => {
    // The whole reason this helper exists: `!!'false'` is `true`, so unchecking a box in a
    // form used to turn the flag ON.
    it.each([
        ['false', false],
        ['0', false],
        ['off', false],
        ['no', false]
    ])('reads %s as false', (input, expected) => {
        expect(parseFormBoolean(input)).toBe(expected);
    });

    it.each([
        ['true', true],
        ['1', true],
        ['on', true],
        ['yes', true]
    ])('reads %s as true', (input, expected) => {
        expect(parseFormBoolean(input)).toBe(expected);
    });

    it('is case-insensitive and ignores surrounding whitespace', () => {
        expect(parseFormBoolean('  FALSE ')).toBe(false);
        expect(parseFormBoolean('True')).toBe(true);
    });

    // Returning the value untouched is what lets the validator downstream answer 422. Coercing
    // it to `true` — as `!!value` did — is how a wrong-typed field became a stored `true`.
    it('returns an unrecognised string unchanged, so the validator can reject it', () => {
        expect(parseFormBoolean('not-a-boolean')).toBe('not-a-boolean');
    });

    it('passes non-strings straight through', () => {
        expect(parseFormBoolean(true)).toBe(true);
        expect(parseFormBoolean(false)).toBe(false);
        // eslint-disable-next-line unicorn/no-useless-undefined -- `value` is a required parameter
        expect(parseFormBoolean(undefined)).toBeUndefined();
        expect(parseFormBoolean(42)).toBe(42);
    });

    // '' is neither true nor false: an empty form field must not become `true`.
    it('returns an empty string unchanged', () => {
        expect(parseFormBoolean('')).toBe('');
    });
});

describe('decodeFormFields', () => {
    const JSON_TYPE = 'application/json';
    const FORM_TYPE = 'multipart/form-data';

    it('decodes multipart booleans and string arrays', () => {
        const request = makeTypedRequest(FORM_TYPE, {
            active: 'false',
            categories: 'tools',
            tags: ['a', 'b']
        });

        expect(
            decodeFormFields(request, {
                booleans: ['active'],
                stringArrays: ['categories', 'tags']
            })
        ).toEqual({ active: false, categories: ['tools'], tags: ['a', 'b'] });
    });

    // The whole reason the helper checks the content type: a JSON body already carries its
    // types, and decoding it would destroy the type error the validator has to see.
    it('leaves a JSON body untouched, wrong types included', () => {
        const request = makeTypedRequest(JSON_TYPE, { active: 'not-a-boolean', categories: 42 });

        expect(
            decodeFormFields(request, { booleans: ['active'], stringArrays: ['categories'] })
        ).toEqual({ active: 'not-a-boolean', categories: 42 });
    });

    it('passes a real JSON boolean through unchanged', () => {
        const request = makeTypedRequest(JSON_TYPE, { active: false });

        expect(decodeFormFields(request, { booleans: ['active'] })).toEqual({ active: false });
    });

    // Defaulting an absent field would turn a partial update into a full overwrite: the service
    // layer only assigns what is defined, so `[]` here would wipe the stored tags.
    it.each([JSON_TYPE, FORM_TYPE])('leaves an absent field undefined (%s)', (contentType) => {
        const request = makeTypedRequest(contentType, {});

        const decoded = decodeFormFields(request, {
            booleans: ['active'],
            stringArrays: ['tags']
        });

        expect(decoded.active).toBeUndefined();
        expect(decoded.tags).toBeUndefined();
    });

    it('returns an empty object when no fields are requested', () => {
        expect(decodeFormFields(makeTypedRequest(FORM_TYPE, { active: 'true' }), {})).toEqual({});
    });

    // express 5 leaves `request.body` undefined for a body-less request.
    it('survives a request with no body at all', () => {
        const request = makeTypedRequest();

        expect(decodeFormFields(request, { booleans: ['active'] })).toEqual({ active: undefined });
    });
});
