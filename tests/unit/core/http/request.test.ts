/**
 * Request input.
 *
 * Written because the first mutation run scored this file 0% — every mutant survived, since no
 * unit test called it at all. It was exercised only through the integration and contract suites,
 * which is precisely how a helper this small ends up with a crash in it.
 *
 * That crash is `readInput`'s "no body at all" cases below: express 5 leaves `request.body`
 * **undefined** when the request carries no body (express 4 defaulted it to `{}`), and the id
 * extraction read a property off it unconditionally. A body-less `DELETE /cart/:productId` —
 * what the frontend actually sends — answered 500.
 *
 * The eleven helpers this file used to cover are now one declaration-driven entry point. Each
 * case that proved something specific about one of them survives here, re-asked of `readInput`:
 * the precedence chain (`mergeBodyQuery`, `extractCustomId`, `extractHardDelete`), the
 * undefined-key pass (`mergeBodyQuery`), the multipart-only transport rule (`decodeFormFields`,
 * `parseFormBoolean`, `isMultipartRequest`) and the no-defaulting rule
 * (`extractRequestPagination`).
 */
import type { Request, Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { extractAndValidateId, isValidObjectId, readInput } from '@core/http/request';

/** A valid 24-hex ObjectId, used wherever the format has to pass. */
const OBJECT_ID = '65dc8a99604c307b702b5ccc';

const JSON_TYPE = 'application/json';
const FORM_TYPE = 'multipart/form-data';

/**
 * Minimal express Request stand-in: params, query, body AND the content type, which is what
 * `readInput` consults before decoding. `is()` answers the way express does — the matched type
 * when the Content-Type matches, `false` when it does not, and `null` when there is no body at
 * all, which is how an omitted `contentType` is expressed.
 */
const makeRequest = (
    overrides: {
        params?: Record<string, unknown>;
        body?: unknown;
        query?: unknown;
        contentType?: string;
    } = {}
) =>
    ({
        params: overrides.params ?? {},
        body: overrides.body,
        query: overrides.query ?? {},
        is: (type: string) =>
            overrides.contentType === undefined
                ? // eslint-disable-next-line unicorn/no-null -- express really returns null here
                  null
                : overrides.contentType === type
                  ? type
                  : false
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

describe('readInput', () => {
    describe('precedence', () => {
        it('resolves sources highest-first, as declared', () => {
            const request = makeRequest({
                params: { text: 'params' },
                body: { text: 'body' },
                query: { text: 'query' },
                contentType: JSON_TYPE
            });

            expect(readInput(request, { sources: ['params', 'body', 'query'] }).text).toBe(
                'params'
            );
            expect(readInput(request, { sources: ['query', 'params', 'body'] }).text).toBe('query');
        });

        it('keeps keys only one source carries', () => {
            const request = makeRequest({
                body: { text: 'body' },
                query: { email: 'a@b.c' },
                contentType: JSON_TYPE
            });

            expect(readInput(request, { sources: ['body', 'query'] })).toEqual({
                text: 'body',
                email: 'a@b.c'
            });
        });

        it('ignores sources the route did not declare', () => {
            const request = makeRequest({
                query: { hardDelete: 'true' },
                body: { text: 'body' },
                contentType: JSON_TYPE
            });

            expect(readInput(request, { sources: ['body'] })).toEqual({ text: 'body' });
        });

        // A spread keeps keys whose value is undefined, and Mongoose would read such a key as a
        // `field: undefined` filter clause instead of ignoring it.
        it('drops keys whose value is explicitly undefined', () => {
            const request = makeRequest({
                body: { text: undefined },
                query: { text: 'query' },
                contentType: JSON_TYPE
            });

            const input = readInput(request, { sources: ['body', 'query'] });

            expect(input).toEqual({});
            expect(Object.keys(input)).toHaveLength(0);
        });

        it('survives a request with no body at all', () => {
            const request = makeRequest({ query: { page: '1' } });

            expect(readInput(request, { sources: ['body', 'query'] })).toEqual({ page: '1' });
        });

        // Nothing is defaulted or bounded here, so `undefined` still means "did not paginate".
        // Defaults, the 1-100 bounds and the NODE_SETTINGS_PAGINATION_PAGE_SIZE fallback all live
        // in `normalizePagination` (@repositories/search), which runs on every search — see
        // tests/unit/repositories/search-pagination.test.ts.
        it('reports absent pagination as absent, not as a default', () => {
            const input = readInput(makeRequest(), { sources: ['body', 'query'] });

            expect(input.page).toBeUndefined();
            expect(input.pageSize).toBeUndefined();
        });
    });

    describe('ids', () => {
        it('prefers the first declared source that carries a value', () => {
            const request = makeRequest({
                params: { productId: OBJECT_ID },
                body: { productId: 'from-body' },
                contentType: JSON_TYPE
            });

            expect(
                readInput(request, { sources: ['params', 'body'], ids: ['productId'] }).productId
            ).toBe(OBJECT_ID);
        });

        it('falls back to the body when the param is absent', () => {
            const request = makeRequest({ body: { productId: OBJECT_ID }, contentType: JSON_TYPE });

            expect(
                readInput(request, { sources: ['params', 'body'], ids: ['productId'] }).productId
            ).toBe(OBJECT_ID);
        });

        // The regression that started this file: express 5 gives `undefined` for a body-less
        // request, and the old helper read the body key before precedence was even applied.
        it('reads the route param when the request has no body at all', () => {
            const request = makeRequest({ params: { productId: OBJECT_ID } });

            expect(
                readInput(request, { sources: ['params', 'body'], ids: ['productId'] }).productId
            ).toBe(OBJECT_ID);
        });

        // The rule the two superseded id helpers spelled differently: `extractCustomId` let an
        // empty param fall through to the body, `extractAndValidateId` did not.
        it('lets an empty value fall through as if the key were absent', () => {
            const request = makeRequest({
                params: { id: '' },
                body: { id: OBJECT_ID },
                contentType: JSON_TYPE
            });

            expect(readInput(request, { sources: ['params', 'body'], ids: ['id'] }).id).toBe(
                OBJECT_ID
            );
        });

        it('keeps an empty value when no source carries a better one', () => {
            const request = makeRequest({ query: { id: '' }, contentType: JSON_TYPE });

            expect(readInput(request, { sources: ['body', 'query'], ids: ['id'] }).id).toBe('');
        });

        // Taking the first entry rather than stringifying the whole array: the latter can never
        // be a valid ObjectId.
        it('takes the first entry when a repeated key arrives as an array', () => {
            const request = makeRequest({
                body: { id: [OBJECT_ID, 'second'] },
                contentType: JSON_TYPE
            });

            expect(readInput(request, { sources: ['body'], ids: ['id'] }).id).toBe(OBJECT_ID);
        });

        it('leaves the key absent when no source carries it', () => {
            const request = makeRequest({ contentType: JSON_TYPE });

            const input = readInput(request, { sources: ['params', 'body'], ids: ['id'] });

            expect(input.id).toBeUndefined();
            expect('id' in input).toBe(false);
        });
    });

    describe('transport decoding', () => {
        it('decodes multipart booleans and string arrays', () => {
            const request = makeRequest({
                body: { active: 'false', categories: 'tools', tags: ['a', 'b'] },
                contentType: FORM_TYPE
            });

            expect(
                readInput(request, {
                    sources: ['body'],
                    booleans: ['active'],
                    stringArrays: ['categories', 'tags']
                })
            ).toEqual({ active: false, categories: ['tools'], tags: ['a', 'b'] });
        });

        // The reason the rule is transport-conditional: a JSON body already carries its types,
        // and decoding it would destroy the type error the validator has to see.
        it('leaves a JSON body untouched, wrong types included', () => {
            const request = makeRequest({
                body: { active: 'not-a-boolean', categories: 42 },
                contentType: JSON_TYPE
            });

            expect(
                readInput(request, {
                    sources: ['body'],
                    booleans: ['active'],
                    stringArrays: ['categories']
                })
            ).toEqual({ active: 'not-a-boolean', categories: 42 });
        });

        // express answers `null`, not `false`, when the request carries no body — a distinction
        // that has to be flattened, or a body-less request would be treated as a form.
        it('does not treat a body with no declared content type as a form', () => {
            const request = makeRequest({ body: { active: 'false' } });

            expect(readInput(request, { sources: ['body'], booleans: ['active'] }).active).toBe(
                'false'
            );
        });

        it.each([
            ['false', false],
            ['0', false],
            ['off', false],
            ['no', false],
            ['true', true],
            ['1', true],
            ['on', true],
            ['yes', true],
            ['  FALSE ', false],
            ['True', true]
        ])('reads the multipart spelling %p as %p', (input, expected) => {
            const request = makeRequest({ body: { active: input }, contentType: FORM_TYPE });

            expect(readInput(request, { sources: ['body'], booleans: ['active'] }).active).toBe(
                expected
            );
        });

        // Passing it through untouched is what lets the validator answer 422. Coercing it to
        // `true` — as `!!value` did — is how a wrong-typed field became a stored `true`. The
        // empty string is neither true nor false: an empty form field must not become `true`.
        it.each(['not-a-boolean', ''])(
            'passes the unrecognisable multipart value %p through for the validator to reject',
            (value) => {
                const request = makeRequest({ body: { active: value }, contentType: FORM_TYPE });

                expect(readInput(request, { sources: ['body'], booleans: ['active'] }).active).toBe(
                    value
                );
            }
        );

        it.each([true, false, 42])(
            'passes the non-string multipart value %p straight through',
            (value) => {
                const request = makeRequest({ body: { active: value }, contentType: FORM_TYPE });

                expect(readInput(request, { sources: ['body'], booleans: ['active'] }).active).toBe(
                    value
                );
            }
        );

        // Defaulting an absent field would turn a partial update into a full overwrite: the
        // service layer only assigns what is defined, so `[]` here would wipe the stored tags.
        it.each([JSON_TYPE, FORM_TYPE])('leaves an absent field absent (%s)', (contentType) => {
            const request = makeRequest({ body: {}, contentType });

            const input = readInput(request, {
                sources: ['body'],
                booleans: ['active'],
                stringArrays: ['tags']
            });

            expect(input).toEqual({});
            expect(input.active).toBeUndefined();
            expect(input.tags).toBeUndefined();
        });

        it('leaves a multipart body alone when nothing is declared to decode', () => {
            const request = makeRequest({
                body: { active: 'false', tags: 'a,b' },
                contentType: FORM_TYPE
            });

            expect(readInput(request, { sources: ['body'] })).toEqual({
                active: 'false',
                tags: 'a,b'
            });
        });
    });

    /**
     * A route param and a query entry are strings by construction — there is nothing typed in
     * them to destroy — so a declared boolean coming from either is always decoded, whatever the
     * body's content type happens to be. This is what makes `?hardDelete=false` mean false; it
     * used to be read as presence, so the string 'false' was truthy and permanently deleted the
     * record.
     */
    describe('string transports', () => {
        const declaration = {
            sources: ['params', 'query', 'body'],
            booleans: ['hardDelete']
        } as const;

        it.each([
            ['true', true],
            ['false', false],
            ['1', true],
            ['0', false]
        ])('decodes the query value %p as %p', (value, expected) => {
            const request = makeRequest({ query: { hardDelete: value } });

            expect(readInput(request, declaration).hardDelete).toBe(expected);
        });

        // What `routeFlag` writes for `DELETE /products/:id/hard`.
        it('decodes a route param the same way', () => {
            const request = makeRequest({ params: { hardDelete: 'true' } });

            expect(readInput(request, declaration).hardDelete).toBe(true);
        });

        it('decodes a query entry even when the body is JSON', () => {
            const request = makeRequest({
                query: { hardDelete: 'false' },
                body: { title: 'x' },
                contentType: JSON_TYPE
            });

            expect(readInput(request, declaration).hardDelete).toBe(false);
        });

        it('still leaves a JSON body value alone, so a wrong type reaches the validator', () => {
            const request = makeRequest({
                body: { hardDelete: 'not-a-boolean' },
                contentType: JSON_TYPE
            });

            expect(readInput(request, declaration).hardDelete).toBe('not-a-boolean');
        });

        it('passes an unrecognisable query value through for the validator to reject', () => {
            const request = makeRequest({ query: { hardDelete: 'maybe' } });

            expect(readInput(request, declaration).hardDelete).toBe('maybe');
        });

        it('leaves it absent when no source carries it, rather than deciding it is false', () => {
            const input = readInput(makeRequest(), declaration);

            expect('hardDelete' in input).toBe(false);
        });

        // The path form wins over a contradictory query: `/products/x/hard?hardDelete=false` is
        // a caller arguing with themselves, and the URL they aimed at is the more explicit one.
        it('applies the declared precedence to a decoded value', () => {
            const request = makeRequest({
                params: { hardDelete: 'true' },
                query: { hardDelete: 'false' }
            });

            expect(readInput(request, declaration).hardDelete).toBe(true);
        });

        // `false` from a higher-precedence source has to survive the undefined-dropping pass —
        // it is a value, not an absence.
        it('does not let a decoded false fall through to a lower source', () => {
            const request = makeRequest({
                query: { hardDelete: 'false' },
                body: { hardDelete: true },
                contentType: JSON_TYPE
            });

            expect(readInput(request, declaration).hardDelete).toBe(false);
        });
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
        const request = makeRequest({ body: { id: OBJECT_ID }, contentType: JSON_TYPE });

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
