/**
 * `parseOpenApi` and `operationsOf` — the one parse guard and the one operation walk every bundler
 * step shares. Driven with a minimal document: the properties under test are what the guard
 * refuses and which path-item keys count as operations.
 */

import { stringify as stringifyYaml } from 'yaml';
import {
    operationsOf,
    parseOpenApi,
    securityOpenMethods
} from '../../../../scripts/contracts/openapi-document';

describe('parseOpenApi', () => {
    it('returns the document a YAML object describes', () => {
        expect(parseOpenApi(stringifyYaml({ openapi: '3.1.0', paths: {} }))).toEqual({
            openapi: '3.1.0',
            paths: {}
        });
    });

    it.each([
        ['a scalar', 'not an object'],
        ['a list', '- just\n- a list\n'],
        ['nothing', '']
    ])('refuses %s', (_label, text) => {
        expect(() => parseOpenApi(text)).toThrow(/did not parse to an object/);
    });
});

describe('operationsOf', () => {
    it('lists each operation with its route and method, and skips what is not one', () => {
        const document = parseOpenApi(
            stringifyYaml({
                openapi: '3.1.0',
                paths: {
                    '/widgets/{id}': {
                        parameters: [{ name: 'id', in: 'path' }],
                        summary: 'one widget',
                        get: { responses: {} },
                        delete: { responses: {} }
                    },
                    '/empty': {}
                }
            })
        );

        expect(operationsOf(document).map(({ route, method }) => `${method} ${route}`)).toEqual([
            'get /widgets/{id}',
            'delete /widgets/{id}'
        ]);
    });

    it('lists nothing for a document with no paths', () => {
        expect(operationsOf(parseOpenApi(stringifyYaml({ openapi: '3.1.0' })))).toEqual([]);
    });
});

/** The one path item of a minimal document, as the generator hands it over. */
const pathItemOf = (item: object) =>
    parseOpenApi(stringifyYaml({ openapi: '3.1.0', paths: { '/x': item } })).paths?.['/x'];

describe('securityOpenMethods', () => {
    it('names only the methods that declare `security: []`', () => {
        const item = pathItemOf({
            post: { security: [], responses: {} },
            get: { security: [{}, { bearerAuth: [] }], responses: {} },
            put: { security: [{ bearerAuth: [] }], responses: {} },
            delete: { responses: {} }
        });

        expect(securityOpenMethods(item)).toEqual(['POST']);
    });

    it('answers nothing for a path with no operations', () => {
        expect(securityOpenMethods(pathItemOf({ parameters: [] }))).toEqual([]);
    });
});
