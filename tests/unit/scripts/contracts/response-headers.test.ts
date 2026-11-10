/**
 * `withAppLevelHeaders` and `withIdempotentReplay` — the post-bundle steps that stamp the headers
 * no operation writes by hand.
 *
 * Driven with a minimal bundled document: the property under test is the stamping rule (every
 * response, an own header wins, a `$ref` response is left to its component), not any real operation.
 */

import type { OpenApiDocument } from '../../../../scripts/contracts/openapi-document';
import { asStub } from '@tests/stub';
import {
    withAppLevelHeaders,
    withIdempotentReplay
} from '../../../../scripts/contracts/response-headers';

/** The root map the cases declare: HTTP header name -> `components/headers` key. */
const HEADERS = { 'x-request-id': 'RequestId', 'Cache-Control': 'CacheControl' };

/** A document with a read, a read that has its own `Cache-Control`, a `$ref` answer and a shared component. */
const bundle = (root?: Record<string, unknown>) =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        ...(root ?? { 'x-app-level-headers': HEADERS }),
        paths: {
            '/plain': { get: { responses: { '200': { description: 'ok' } } } },
            '/own': {
                get: {
                    responses: {
                        '200': {
                            description: 'ok',
                            headers: { 'cache-control': { description: 'mine' } }
                        },
                        '404': { $ref: '#/components/responses/NotFound' }
                    }
                }
            }
        },
        components: { responses: { NotFound: { description: 'gone' } } }
    });

/** Runs a step on a document and returns the document. */
const applied = (step: (document: OpenApiDocument) => void, document: OpenApiDocument) => {
    step(document);
    return document;
};

describe('withAppLevelHeaders', () => {
    it('declares each root header on every inline response and on every shared component', () => {
        const result = applied(withAppLevelHeaders, bundle());

        expect(result.paths?.['/plain']?.get?.responses?.['200']).toHaveProperty('headers', {
            'x-request-id': { $ref: '#/components/headers/RequestId' },
            'Cache-Control': { $ref: '#/components/headers/CacheControl' }
        });
        expect(result.components?.responses?.NotFound).toHaveProperty('headers', {
            'x-request-id': { $ref: '#/components/headers/RequestId' },
            'Cache-Control': { $ref: '#/components/headers/CacheControl' }
        });
    });

    it('leaves a header the response declares itself, whatever its case, and does not touch a $ref answer', () => {
        const result = applied(withAppLevelHeaders, bundle());
        const own = result.paths?.['/own']?.get?.responses;

        expect(own?.['200']).toHaveProperty('headers', {
            'cache-control': { description: 'mine' },
            'x-request-id': { $ref: '#/components/headers/RequestId' }
        });
        expect(own?.['404']).toEqual({ $ref: '#/components/responses/NotFound' });
    });

    it('leaves `ETag` off every write answer, because only an operation that answers a real tag declares one', () => {
        const document_ = asStub<OpenApiDocument>({
            openapi: '3.1.0',
            'x-app-level-headers': { ETag: 'EntityTag' },
            paths: {
                '/item': {
                    put: { responses: { '200': { description: 'replaced' } } },
                    patch: { responses: { '200': { description: 'merged' } } },
                    get: { responses: { '200': { description: 'read' } } }
                }
            }
        });

        const { paths } = applied(withAppLevelHeaders, document_);

        expect(paths?.['/item']?.put?.responses?.['200']).toEqual({
            description: 'replaced',
            headers: {}
        });
        expect(paths?.['/item']?.patch?.responses?.['200']).toEqual({
            description: 'merged',
            headers: {}
        });
        expect(paths?.['/item']?.get?.responses?.['200']).toHaveProperty('headers', {
            ETag: { $ref: '#/components/headers/EntityTag' }
        });
    });

    it('spends the root key, which is an instruction to the step', () => {
        expect(applied(withAppLevelHeaders, bundle())).not.toHaveProperty('x-app-level-headers');
    });

    it('refuses a root that declares no map', () => {
        expect(() => withAppLevelHeaders(bundle({}))).toThrow(/x-app-level-headers/);
    });
});

/** The replay header's declaration, as every stamped response carries it. */
const REPLAYED = { $ref: '#/components/headers/Idempotent-Replayed' };

/** A keyed write and a plain one, both pointing at the shared 409 and 429; `created` is the keyed 201. */
const writes = (created: Record<string, unknown>) =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        paths: {
            '/keyed': {
                post: {
                    parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
                    responses: {
                        '201': created,
                        '400': { description: 'bad' },
                        '409': { $ref: '#/components/responses/Conflict' },
                        '429': { $ref: '#/components/responses/TooManyRequests' }
                    }
                }
            },
            '/plain': {
                post: {
                    responses: {
                        '201': { description: 'made' },
                        '409': { $ref: '#/components/responses/Conflict' }
                    }
                }
            }
        },
        components: {
            responses: {
                Conflict: { description: 'conflict', headers: { Location: {} } },
                TooManyRequests: { description: 'slow down' }
            }
        }
    });

describe('withIdempotentReplay', () => {
    it('declares Idempotent-Replayed on every inline answer of a keyed operation, and nowhere else', () => {
        const result = applied(
            withIdempotentReplay,
            writes({ description: 'made', headers: { Location: {} } })
        );
        const keyed = result.paths?.['/keyed']?.post?.responses;

        expect(keyed?.['201']).toHaveProperty('headers', {
            Location: {},
            'Idempotent-Replayed': REPLAYED
        });
        expect(keyed?.['400']).toHaveProperty('headers', { 'Idempotent-Replayed': REPLAYED });
        expect(result.paths?.['/plain']?.post?.responses?.['201']).toEqual({
            description: 'made'
        });
    });

    it('points a keyed $ref at a twin with the header, and a non-keyed one at the untouched original', () => {
        const result = applied(withIdempotentReplay, writes({ description: 'made' }));

        expect(result.paths?.['/keyed']?.post?.responses?.['409']).toEqual({
            $ref: '#/components/responses/ConflictReplayable'
        });
        expect(result.paths?.['/plain']?.post?.responses?.['409']).toEqual({
            $ref: '#/components/responses/Conflict'
        });
        expect(result.components?.responses?.ConflictReplayable).toEqual({
            description: 'conflict',
            headers: { Location: {}, 'Idempotent-Replayed': REPLAYED }
        });
        expect(result.components?.responses?.Conflict).toEqual({
            description: 'conflict',
            headers: { Location: {} }
        });
    });

    it('leaves a 429 plain, because the ledger never sees one', () => {
        const result = applied(withIdempotentReplay, writes({ description: 'made' }));

        expect(result.paths?.['/keyed']?.post?.responses?.['429']).toEqual({
            $ref: '#/components/responses/TooManyRequests'
        });
        expect(result.components?.responses).not.toHaveProperty('TooManyRequestsReplayable');
    });

    it('clones deep, so stamping a twin never reaches the original', () => {
        const result = applied(withIdempotentReplay, writes({ description: 'made' }));
        const original = result.components?.responses?.Conflict as { headers: object };
        const twin = result.components?.responses?.ConflictReplayable as { headers: object };

        expect(twin.headers).not.toBe(original.headers);
    });

    it('also stamps the operation that requires the key', () => {
        const required = asStub<OpenApiDocument>({
            openapi: '3.1.0',
            paths: {
                '/pay': {
                    post: {
                        parameters: [
                            { $ref: '#/components/parameters/RequiredIdempotencyKeyHeader' }
                        ],
                        responses: { '200': { description: 'ok' } }
                    }
                }
            }
        });

        expect(
            applied(withIdempotentReplay, required).paths?.['/pay']?.post?.responses?.['200']
        ).toHaveProperty(['headers', 'Idempotent-Replayed']);
    });

    it('refuses a $ref that names no inline shared response, so there is nothing to clone', () => {
        const missing = asStub<OpenApiDocument>({
            openapi: '3.1.0',
            paths: {
                '/keyed': {
                    post: {
                        parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
                        responses: { '201': { $ref: '#/components/responses/NoContent' } }
                    }
                }
            }
        });

        expect(() => withIdempotentReplay(missing)).toThrow(
            /POST \/keyed: `NoContent` is not an inline shared response/
        );
    });
});
