import { parse as parseYaml } from 'yaml';
import { pruneUnused } from '../../../../scripts/contracts/prune-unused';

/** A bundle with a used chain, orphans of every kind, and one tag nobody uses. */
const BUNDLE = `openapi: 3.1.0
tags:
    - name: Used
    - name: Orphan
security: []
paths:
    /things:
        get:
            tags: [Used]
            security:
                - bearerAuth: []
            parameters:
                - $ref: '#/components/parameters/Page'
            responses:
                '200':
                    description: ok
                    content:
                        application/json:
                            schema:
                                $ref: '#/components/schemas/Thing'
components:
    securitySchemes:
        bearerAuth: { type: http, scheme: bearer }
        apiKeyAuth: { type: http, scheme: bearer }
    parameters:
        Page: { name: page, in: query, schema: { type: integer } }
        Gone: { name: gone, in: query, schema: { type: integer } }
    responses:
        Orphan: { description: nobody uses me }
    schemas:
        Thing:
            type: object
            properties:
                part:
                    $ref: '#/components/schemas/Part'
        Part: { type: string }
        Lonely:
            $ref: '#/components/schemas/Part'
        Unused: { type: string }
`;

/** The pruned bundle, parsed. */
const pruned = () =>
    parseYaml(pruneUnused(BUNDLE)) as {
        tags: { name: string }[];
        components: Record<string, Record<string, unknown>>;
    };

describe('pruneUnused', () => {
    it('keeps what a path reaches, directly or through another component', () => {
        const { components } = pruned();

        expect(Object.keys(components.schemas).toSorted()).toEqual(['Part', 'Thing']);
        expect(Object.keys(components.parameters)).toEqual(['Page']);
    });

    it('drops a component only an unreferenced component points at', () => {
        expect(pruned().components.schemas).not.toHaveProperty('Lonely');
    });

    it('drops a whole unused kind to an empty map, and an unused response', () => {
        expect(pruned().components.responses).toEqual({});
    });

    it('keeps a security scheme a requirement names, and drops one nothing names', () => {
        expect(Object.keys(pruned().components.securitySchemes)).toEqual(['bearerAuth']);
    });

    it('drops a tag no operation uses', () => {
        expect(pruned().tags).toEqual([{ name: 'Used' }]);
    });

    it('refuses text that is not an object', () => {
        expect(() => pruneUnused('- just\n- a list\n')).toThrow(/did not parse to an object/);
    });
});
