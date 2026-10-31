/**
 * `withAppLevelHeaders` and `withIdempotentReplay` — the post-bundle steps that stamp the headers
 * no operation writes by hand.
 *
 * Driven with a minimal bundled document: the property under test is the stamping rule (every
 * response, an own header wins, a `$ref` response is left to its component), not any real operation.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
    withAppLevelHeaders,
    withIdempotentReplay
} from '../../../../scripts/contracts/response-headers';

/** The shape the assertions read back out of a stamped document. */
interface Stamped {
    'x-app-level-headers'?: unknown;
    paths: Record<
        string,
        Record<string, { parameters?: unknown[]; responses: Record<string, { headers?: object }> }>
    >;
    components: { responses: Record<string, { headers?: object }> };
}

/** The root map the cases declare: HTTP header name -> `components/headers` key. */
const HEADERS = { 'x-request-id': 'RequestId', 'Cache-Control': 'CacheControl' };

/** A document with a read, a read that has its own `Cache-Control`, a `$ref` answer and a shared component. */
const bundle = (root?: Record<string, unknown>) =>
    stringifyYaml({
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

describe('withAppLevelHeaders', () => {
    it('declares each root header on every inline response and on every shared component', () => {
        const result = parseYaml(withAppLevelHeaders(bundle())) as Stamped;

        expect(result.paths['/plain']?.get?.responses['200']?.headers).toEqual({
            'x-request-id': { $ref: '#/components/headers/RequestId' },
            'Cache-Control': { $ref: '#/components/headers/CacheControl' }
        });
        expect(Object.keys(result.components.responses.NotFound?.headers ?? {})).toEqual([
            'x-request-id',
            'Cache-Control'
        ]);
    });

    it('leaves a header the response declares itself, whatever its case, and does not touch a $ref answer', () => {
        const result = parseYaml(withAppLevelHeaders(bundle())) as Stamped;
        const own = result.paths['/own']?.get?.responses;

        expect(own?.['200']?.headers).toEqual({
            'cache-control': { description: 'mine' },
            'x-request-id': { $ref: '#/components/headers/RequestId' }
        });
        expect(own?.['404']).toEqual({ $ref: '#/components/responses/NotFound' });
    });

    it('spends the root key, which is an instruction to the step', () => {
        expect(parseYaml(withAppLevelHeaders(bundle())) as Stamped).not.toHaveProperty(
            'x-app-level-headers'
        );
    });

    it('refuses a root that declares no map', () => {
        expect(() => withAppLevelHeaders(bundle({}))).toThrow(/x-app-level-headers/);
    });
});

/** A write taking the key through the shared parameter, next to one that does not. */
const writes = (created: Record<string, unknown>) =>
    stringifyYaml({
        openapi: '3.1.0',
        paths: {
            '/keyed': {
                post: {
                    parameters: [{ $ref: '#/components/parameters/IdempotencyKeyHeader' }],
                    responses: {
                        '201': created,
                        '409': { description: 'conflict' }
                    }
                }
            },
            '/plain': { post: { responses: { '201': { description: 'made' } } } }
        }
    });

describe('withIdempotentReplay', () => {
    it('declares Idempotent-Replay on the 2xx of an operation taking the key, and nowhere else', () => {
        const result = parseYaml(
            withIdempotentReplay(writes({ description: 'made', headers: { Location: {} } }))
        ) as Stamped;

        expect(result.paths['/keyed']?.post?.responses['201']?.headers).toEqual({
            Location: {},
            'Idempotent-Replay': { $ref: '#/components/headers/Idempotent-Replay' }
        });
        expect(result.paths['/keyed']?.post?.responses['409']).toEqual({ description: 'conflict' });
        expect(result.paths['/plain']?.post?.responses['201']).toEqual({ description: 'made' });
    });

    it('also stamps the operation that requires the key', () => {
        const required = stringifyYaml({
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
            (parseYaml(withIdempotentReplay(required)) as Stamped).paths['/pay']?.post?.responses[
                '200'
            ]?.headers
        ).toHaveProperty('Idempotent-Replay');
    });

    it('refuses a 2xx that is a $ref, which cannot take a header of its own', () => {
        expect(() =>
            withIdempotentReplay(writes({ $ref: '#/components/responses/NoContent' }))
        ).toThrow(/POST \/keyed: an idempotent operation needs an inline 201/);
    });
});
