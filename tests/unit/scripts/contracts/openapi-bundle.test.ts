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
import { withAppLevelResponses } from '../../../../scripts/contracts/openapi-bundle';

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
