/**
 * `withAppLevelResponses` — the post-bundle merge that gives every operation the app-level
 * responses (429, and 400/413 for a body-carrying one) that no module fragment declares, since
 * none of the three middlewares that can refuse first belongs to any one route.
 *
 * Driven with a minimal bundled document rather than the real `openapi.yaml`: the property under
 * test is the merge rule itself — `appliesTo`, and never overwriting an operation's own more
 * specific answer — not any particular operation's current responses.
 */

import { asStub } from '@tests/stub';
import type { OpenApiDocument } from '../../../../scripts/contracts/openapi-document';
import {
    checkOperationErrorCodes,
    withAppLevelResponses,
    withErrorCodes,
    withModuleStamps,
    withNotModified,
    withVersionedResources
} from '../../../../scripts/contracts/openapi-bundle';

/** A bundled document small enough to read in one glance, shaped exactly like `compile()` feeds in. */
const bundle = (extra: Record<string, unknown>) =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        'x-app-level-responses': {
            '429': { response: 'TooManyRequests', appliesTo: 'all' },
            '400': { response: 'BadRequest', appliesTo: 'requestBody' },
            '415': { response: 'UnsupportedMediaType', appliesTo: 'requestBodyOrBodyless' }
        },
        paths: extra
    });

/** Runs the step on the document and returns the document. */
const parsedResult = (document: OpenApiDocument) => {
    withAppLevelResponses(document);
    return document;
};

describe('withAppLevelResponses', () => {
    it('merges the all-applicable response into an operation with no body', () => {
        const result = parsedResult(
            bundle({ '/health': { get: { responses: { '200': { description: 'ok' } } } } })
        );

        const responses = result.paths?.['/health']?.get?.responses;
        expect(responses).toHaveProperty('429');
        expect(responses).not.toHaveProperty('400');
    });

    it('merges the requestBody-only response into an operation that declares one', () => {
        const result = parsedResult(
            bundle({
                '/widgets': {
                    post: { requestBody: {}, responses: { '201': { description: 'created' } } }
                }
            })
        );

        const responses = result.paths?.['/widgets']?.post?.responses;
        expect(responses).toHaveProperty('429');
        expect(responses).toHaveProperty('400');
    });

    it('gives a DELETE without a body the 415 a GET without one does not get', () => {
        const result = parsedResult(
            bundle({
                '/widgets/{id}': {
                    delete: { responses: { '200': { description: 'ok' } } },
                    get: { responses: { '200': { description: 'ok' } } }
                }
            })
        );

        expect(result.paths?.['/widgets/{id}']?.delete?.responses).toHaveProperty('415');
        expect(result.paths?.['/widgets/{id}']?.get?.responses).not.toHaveProperty('415');
    });

    it('never overwrites a response the operation already declares for itself', () => {
        const result = parsedResult(
            bundle({
                '/widgets': {
                    get: {
                        responses: {
                            '200': { description: 'ok' },
                            '429': { $ref: '#/components/responses/WidgetSpecificTooManyRequests' }
                        }
                    }
                }
            })
        );

        expect(result.paths?.['/widgets']?.get?.responses?.['429']).toEqual({
            $ref: '#/components/responses/WidgetSpecificTooManyRequests'
        });
    });

    it('leaves a non-operation path-item field untouched', () => {
        // `parameters` and `summary` are not in OPERATION_METHODS -- collecting responses onto
        // them would corrupt the document rather than merge anything.
        const result = parsedResult(
            bundle({
                '/widgets/{id}': {
                    parameters: [{ name: 'id', in: 'path' }],
                    get: { responses: { '200': { description: 'ok' } } }
                }
            })
        );

        expect(result.paths?.['/widgets/{id}']?.parameters).toEqual([{ name: 'id', in: 'path' }]);
    });

    it('deletes the instruction key from the compiled document', () => {
        const result = parsedResult(bundle({}));

        expect(result).not.toHaveProperty('x-app-level-responses');
    });

    it('throws when the root declares no x-app-level-responses at all', () => {
        expect(() =>
            withAppLevelResponses(asStub<OpenApiDocument>({ openapi: '3.1.0', paths: {} }))
        ).toThrow(/x-app-level-responses/);
    });
});

/** A bundled document small enough to read in one glance, for `withModuleStamps`' own tests. */
const stampBundle = (paths: Record<string, unknown>) =>
    asStub<OpenApiDocument>({ openapi: '3.1.0', paths });

/** Stamps `stampBundle`'s document against a small map and returns it. */
const stampedResult = (document: OpenApiDocument, moduleByPath: Record<string, string>) => {
    withModuleStamps(document, moduleByPath);
    return document;
};

/**
 * `withModuleStamps` — tags every operation with the `x-module` the map assigns its path to.
 * Driven with a small map rather than the real contract, the same split
 * `withAppLevelResponses`'s own tests keep: the property under test is the STAMPING rule, not any
 * particular path's real owner.
 */
describe('withModuleStamps', () => {
    it('stamps every operation a path maps to a module', () => {
        const result = stampedResult(
            stampBundle({
                '/products': {
                    get: { responses: {} },
                    post: { responses: {} }
                }
            }),
            { '/products': 'products' }
        );

        expect(result.paths?.['/products']?.get?.['x-module']).toBe('products');
        expect(result.paths?.['/products']?.post?.['x-module']).toBe('products');
    });

    it('leaves a path the map does not mention unstamped — a `system` path, owned by no module', () => {
        const result = stampedResult(stampBundle({ '/': { get: { responses: {} } } }), {});

        expect(result.paths?.['/']?.get).not.toHaveProperty('x-module');
    });

    it('leaves a non-operation path-item field untouched', () => {
        const result = stampedResult(
            stampBundle({
                '/products/{id}': {
                    parameters: [{ name: 'id', in: 'path' }],
                    get: { responses: {} }
                }
            }),
            { '/products/{id}': 'products' }
        );

        expect(result.paths?.['/products/{id}']?.parameters).toEqual([{ name: 'id', in: 'path' }]);
    });
});

/** A bundled document small enough to read in one glance, for `withErrorCodes`' own tests. */
const errorCodesBundle = () =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        components: { schemas: { ErrorItem: { type: 'object' } } }
    });

/** Publishes a small catalogue into `errorCodesBundle`'s document and returns it. */
const errorCodesResult = (
    document: OpenApiDocument,
    errorCodes: Record<string, { status: number; description: string }>
) => {
    withErrorCodes(document, errorCodes);
    return document;
};

/**
 * `withErrorCodes` — publishes the collected error-code catalogue as the bundled document's own
 * `x-error-codes`. Driven with a small map rather than the real contract, same split as
 * the other two suites above.
 */
describe('withErrorCodes', () => {
    it('publishes every collected code, sorted', () => {
        const result = errorCodesResult(errorCodesBundle(), {
            CART_EMPTY: { status: 409, description: 'The cart has no lines.' },
            BAD_REQUEST: { status: 400, description: 'Malformed request.' }
        });

        expect(Object.keys(result['x-error-codes'] ?? {})).toEqual(['BAD_REQUEST', 'CART_EMPTY']);
        expect(result['x-error-codes']?.CART_EMPTY).toEqual({
            status: 409,
            description: 'The cart has no lines.'
        });
    });

    it('throws when the bundle has no ErrorItem schema to publish alongside', () => {
        expect(() =>
            withErrorCodes(
                asStub<OpenApiDocument>({ openapi: '3.1.0', components: { schemas: {} } }),
                {}
            )
        ).toThrow(/ErrorItem/);
    });
});

/**
 * `withVersionedResources` — hangs `ETag`, `If-Match` and 412 on the operations a path item's
 * `x-versioned` marker lists. Driven with a small document, same split as the suites above.
 */

/** One versioned path: a read, a PATCH, a DELETE — each with an inline 200. */
const versionedPath = (marker: string[]) => ({
    '/widgets/{id}': {
        'x-versioned': marker,
        get: { responses: { '200': { description: 'ok' } } },
        patch: { parameters: [{ name: 'id' }], responses: { '200': { description: 'ok' } } },
        delete: { responses: { '200': { description: 'ok' } } }
    }
});

/** Runs the step on `paths`, and reads back the one path every case is about. */
const run = (paths: Record<string, unknown>) => {
    const document = asStub<OpenApiDocument>({ openapi: '3.1.0', paths });
    withVersionedResources(document);
    return document.paths?.['/widgets/{id}'];
};

describe('withVersionedResources', () => {
    it('adds ETag to a listed read and to a listed PATCH 200', () => {
        const item = run(versionedPath(['get', 'patch']));

        expect(item?.get?.responses?.['200']).toHaveProperty('headers', {
            ETag: { $ref: '#/components/headers/ETag' }
        });
        expect(item?.patch?.responses?.['200']).toHaveProperty(['headers', 'ETag']);
    });

    it("adds If-Match after the operation's own parameters, and the 412, to a listed write", () => {
        const patch = run(versionedPath(['get', 'patch']))?.patch;

        expect(patch?.parameters).toEqual([
            { name: 'id' },
            { $ref: '#/components/parameters/IfMatchHeader' }
        ]);
        expect(patch?.responses).toHaveProperty('412');
    });

    it('gives a listed DELETE the precondition but no ETag: it answers no row', () => {
        const remove = run(versionedPath(['delete']))?.delete;

        expect(remove?.responses).toHaveProperty('412');
        expect(remove?.responses?.['200']).not.toHaveProperty('headers');
    });

    it('leaves an unlisted operation untouched', () => {
        const item = run(versionedPath(['get']));

        expect(item?.patch?.parameters).toEqual([{ name: 'id' }]);
        expect(item?.delete?.responses).not.toHaveProperty('412');
    });

    it('throws for a method the path does not declare, or one that is neither read nor write', () => {
        expect(() => run(versionedPath(['put']))).toThrow(/does not declare/);
        expect(() =>
            run({ '/widgets/{id}': { 'x-versioned': ['post'], post: { responses: {} } } })
        ).toThrow(/cannot name post/);
    });

    it('throws when the 200 to hang ETag on is a $ref', () => {
        expect(() =>
            run({
                '/widgets/{id}': {
                    'x-versioned': ['get'],
                    get: { responses: { '200': { $ref: '#/components/responses/Success' } } }
                }
            })
        ).toThrow(/inline 200/);
    });
});

/** `withNotModified` — the shared 304 on the reads that declare `x-cache`, and only those. */
const run304 = (cache: Record<string, string | undefined>) => {
    const document = asStub<OpenApiDocument>({
        openapi: '3.1.0',
        paths: {
            '/things': {
                get: {
                    ...(cache['/things'] && { 'x-cache': cache['/things'] }),
                    responses: { '200': { description: 'ok' } }
                }
            },
            '/other': { get: { responses: { '200': { description: 'ok' } } } }
        }
    });
    withNotModified(document);
    return document.paths ?? {};
};

describe('withNotModified', () => {
    it.each(['private-no-cache', 'revalidate', 'max-age: 3600'])(
        'adds the shared 304 to a read declaring x-cache: %s, and leaves its other answers',
        (policy) => {
            const paths = run304({ '/things': policy });

            expect(paths['/things']?.get?.responses?.['304']).toEqual({
                $ref: '#/components/responses/NotModified'
            });
            expect(paths['/things']?.get?.responses?.['200']).toEqual({ description: 'ok' });
        }
    );

    it('gives no-store a Cache-Control header on its 200 and no 304', () => {
        const paths = run304({ '/things': 'no-store' });
        const responses = paths['/things']?.get?.responses;

        expect(responses?.['304']).toBeUndefined();
        expect(responses?.['200']).toHaveProperty(['headers', 'Cache-Control']);
    });

    it('leaves a read with no x-cache alone', () => {
        const paths = run304({ '/things': 'revalidate' });

        expect(paths['/other']?.get?.responses?.['304']).toBeUndefined();
    });
});

/** `withVersionedResources` keeps headers an operation already declares on its 200. */
describe('withVersionedResources and an operation header of its own', () => {
    it('adds ETag beside an existing Cache-Control header', () => {
        const item = run({
            '/widgets/{id}': {
                'x-versioned': ['get'],
                get: {
                    responses: { '200': { description: 'ok', headers: { 'Cache-Control': {} } } }
                }
            }
        });

        expect(item?.get?.responses?.['200']).toHaveProperty('headers', {
            'Cache-Control': {},
            ETag: { $ref: '#/components/headers/ETag' }
        });
    });
});

/** A one-operation document listing `codes` on `POST /cart`. */
const listing = (codes: Record<string, string[]>) =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        paths: { '/cart': { post: { 'x-error-codes': codes, responses: {} } } }
    });

/** `checkOperationErrorCodes` — an operation's per-status code list must agree with the catalogue. */
describe('checkOperationErrorCodes', () => {
    const catalogue = {
        CART_EMPTY: { status: 409, description: 'empty' },
        CART_ADDRESS_REQUIRED: { status: 422, description: 'address' }
    };

    it('passes a list whose names exist under their catalogue status, and leaves the document as it came', () => {
        const document = listing({ '409': ['CART_EMPTY'], '422': ['CART_ADDRESS_REQUIRED'] });

        expect(() => checkOperationErrorCodes(document, catalogue)).not.toThrow();
        expect(document).toEqual(
            listing({ '409': ['CART_EMPTY'], '422': ['CART_ADDRESS_REQUIRED'] })
        );
    });

    it('refuses a name no fragment declares', () => {
        expect(() =>
            checkOperationErrorCodes(listing({ '409': ['CART_EMTPY'] }), catalogue)
        ).toThrow(/POST \/cart lists CART_EMTPY under 409, which no fragment/);
    });

    it('refuses a name listed under a status the catalogue does not give it', () => {
        expect(() =>
            checkOperationErrorCodes(listing({ '422': ['CART_EMPTY'] }), catalogue)
        ).toThrow(/CART_EMPTY under 422, but the catalogue gives it 409/);
    });

    it('leaves an operation with no list alone', () => {
        const document = asStub<OpenApiDocument>({
            openapi: '3.1.0',
            paths: { '/a': { get: { responses: {} } } }
        });

        expect(() => checkOperationErrorCodes(document, catalogue)).not.toThrow();
    });
});
