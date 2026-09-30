/**
 * `withAppLevelResponses` — the post-bundle merge that gives every operation the app-level
 * responses (429, and 400/413 for a body-carrying one) that no module fragment declares, since
 * none of the three middlewares that can refuse first belongs to any one route.
 *
 * Driven with a minimal bundled document rather than the real `openapi.yaml`: the property under
 * test is the merge rule itself — `appliesTo`, and never overwriting an operation's own more
 * specific answer — not any particular operation's current responses.
 */

import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import {
    withAppLevelResponses,
    withErrorCodes,
    withModuleStamps,
    withVersionedResources
} from '../../../../scripts/contracts/openapi-bundle';

/** A bundled document small enough to read in one glance, shaped exactly like `compile()` feeds in. */
const bundle = (extra: Record<string, unknown>) =>
    stringifyYaml({
        openapi: '3.0.3',
        'x-app-level-responses': {
            '429': { response: 'TooManyRequests', appliesTo: 'all' },
            '400': { response: 'BadRequest', appliesTo: 'requestBody' }
        },
        paths: extra
    });

/** Parsed-back result, typed only as far as this file's assertions read into it. */
const parsedResult = (yaml: string) =>
    parseYaml(withAppLevelResponses(yaml)) as {
        'x-app-level-responses'?: unknown;
        paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
    };

describe('withAppLevelResponses', () => {
    it('merges the all-applicable response into an operation with no body', () => {
        const result = parsedResult(
            bundle({ '/health': { get: { responses: { '200': { description: 'ok' } } } } })
        );

        const responses = result.paths['/health']?.get?.responses;
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

        const responses = result.paths['/widgets']?.post?.responses;
        expect(responses).toHaveProperty('429');
        expect(responses).toHaveProperty('400');
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

        expect(result.paths['/widgets']?.get?.responses['429']).toEqual({
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

        expect(result.paths['/widgets/{id}']?.parameters).toEqual([{ name: 'id', in: 'path' }]);
    });

    it('deletes the instruction key from the compiled document', () => {
        const result = parsedResult(bundle({}));

        expect(result).not.toHaveProperty('x-app-level-responses');
    });

    it('throws when the root declares no x-app-level-responses at all', () => {
        expect(() => withAppLevelResponses(stringifyYaml({ openapi: '3.0.3', paths: {} }))).toThrow(
            /x-app-level-responses/
        );
    });
});

/** A bundled document small enough to read in one glance, for `withModuleStamps`' own tests. */
const stampBundle = (paths: Record<string, unknown>) => stringifyYaml({ openapi: '3.0.3', paths });

/** Parsed-back result of stamping `stampBundle`'s output against a small map. */
const stampedResult = (yaml: string, moduleByPath: Record<string, string>) =>
    parseYaml(withModuleStamps(yaml, moduleByPath)) as {
        paths: Record<string, Record<string, { 'x-module'?: string }>>;
    };

/**
 * `withModuleStamps` — tags every operation with the `x-module` the map assigns its path to
 * (FA59). Driven with a small map rather than the real contract, the same split
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

        expect(result.paths['/products']?.get?.['x-module']).toBe('products');
        expect(result.paths['/products']?.post?.['x-module']).toBe('products');
    });

    it('leaves a path the map does not mention unstamped — a `system` path, owned by no module', () => {
        const result = stampedResult(stampBundle({ '/': { get: { responses: {} } } }), {});

        expect(result.paths['/']?.get).not.toHaveProperty('x-module');
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

        expect(result.paths['/products/{id}']?.parameters).toEqual([{ name: 'id', in: 'path' }]);
    });

    it('throws when the bundled document does not parse to an object', () => {
        expect(() => withModuleStamps(stringifyYaml('not an object'), {})).toThrow(
            /did not parse to an object/
        );
    });
});

/** A bundled document small enough to read in one glance, for `withErrorCodes`' own tests. */
const errorCodesBundle = () =>
    stringifyYaml({
        openapi: '3.0.3',
        components: { schemas: { ErrorItem: { type: 'object' } } }
    });

/** Parsed-back result of publishing `errorCodesBundle`'s output against a small catalogue. */
const errorCodesResult = (
    yaml: string,
    errorCodes: Record<string, { status: number; description: string }>
) =>
    parseYaml(withErrorCodes(yaml, errorCodes)) as {
        'x-error-codes'?: Record<string, unknown>;
    };

/**
 * `withErrorCodes` — publishes the collected error-code catalogue as the bundled document's own
 * `x-error-codes` (CT-D5). Driven with a small map rather than the real contract, same split as
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
            withErrorCodes(stringifyYaml({ openapi: '3.0.3', components: { schemas: {} } }), {})
        ).toThrow(/ErrorItem/);
    });

    it('throws when the bundled document does not parse to an object', () => {
        expect(() => withErrorCodes(stringifyYaml('not an object'), {})).toThrow(
            /did not parse to an object/
        );
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

interface Operation {
    parameters?: unknown[];
    responses: Record<string, { headers?: unknown }>;
}

/** Bundles `paths`, and reads back the one path every case is about. */
const run = (paths: Record<string, unknown>) =>
    (
        parseYaml(withVersionedResources(stringifyYaml({ openapi: '3.0.3', paths }))) as {
            paths: Record<string, Record<string, Operation>>;
        }
    ).paths['/widgets/{id}'];

describe('withVersionedResources', () => {
    it('adds ETag to a listed read and to a listed PATCH 200', () => {
        const item = run(versionedPath(['get', 'patch']));

        expect(item?.get?.responses['200']?.headers).toEqual({
            ETag: { $ref: '#/components/headers/ETag' }
        });
        expect(item?.patch?.responses['200']?.headers).toHaveProperty('ETag');
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
        expect(remove?.responses['200']).not.toHaveProperty('headers');
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
