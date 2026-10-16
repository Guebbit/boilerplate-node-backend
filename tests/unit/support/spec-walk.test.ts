/**
 * The spec walk and the arbitrary builder, on schemas written for the purpose.
 *
 * They are the fuzz suite's own foundation: if `allOf` collapsed or `null` in a `type` array were ignored the
 * fuzz would stay green while sending nothing useful, so each is pinned here where a failure
 * names the cause instead of an endpoint.
 */
import fc from 'fast-check';
import {
    isNullable,
    resolveSchema,
    securityRequiresAuth,
    unsupportedKeywords,
    type SchemaNode
} from '@tests/spec-walk';
import { arbitraryFor } from '@tests/spec-arbitraries';

/** A spec document with just the schemas a case needs. */
const specOf = (schemas: Record<string, SchemaNode>) => ({ paths: {}, components: { schemas } });

describe('resolveSchema: allOf', () => {
    const spec = specOf({
        Locale: { type: 'string', pattern: '^[a-z]{2}$' },
        Base: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
        Extra: { type: 'object', required: ['b'], properties: { b: { type: 'integer' } } }
    });

    it('keeps the scalar type and the pattern of a wrapped string, plus the sibling null type', () => {
        const resolved = resolveSchema(
            {
                type: ['string', 'null'],
                allOf: [{ $ref: '#/components/schemas/Locale' }]
            },
            spec
        );

        expect(resolved).toEqual({ type: ['string', 'null'], pattern: '^[a-z]{2}$' });
    });

    it('unions the properties and the required lists of several parts', () => {
        const resolved = resolveSchema(
            {
                allOf: [
                    { $ref: '#/components/schemas/Base' },
                    { $ref: '#/components/schemas/Extra' }
                ]
            },
            spec
        );

        expect(Object.keys(resolved?.properties ?? {})).toEqual(['a', 'b']);
        expect(resolved?.required).toEqual(['a', 'b']);
    });

    it('resolves an allOf that sits under a property', () => {
        const resolved = resolveSchema(
            {
                type: 'object',
                properties: { locale: { allOf: [{ $ref: '#/components/schemas/Locale' }] } }
            },
            spec
        );

        expect(resolved?.properties?.locale).toMatchObject({ type: 'string' });
    });

    it('resolves the value schema of a map', () => {
        const resolved = resolveSchema(
            {
                type: 'object',
                additionalProperties: { allOf: [{ $ref: '#/components/schemas/Base' }] }
            },
            spec
        );

        expect(resolved?.additionalProperties).toMatchObject({ type: 'object' });
    });
});

describe('resolveSchema: null', () => {
    const spec = specOf({ Locale: { type: 'string', pattern: '^[a-z]{2}$' } });

    it('folds oneOf [$ref, null] into the referenced node with null added to its type', () => {
        const resolved = resolveSchema(
            { oneOf: [{ $ref: '#/components/schemas/Locale' }, { type: 'null' }] },
            spec
        );

        expect(resolved).toEqual({ type: ['string', 'null'], pattern: '^[a-z]{2}$' });
        expect(isNullable(resolved)).toBe(true);
    });

    it('leaves a oneOf of two real variants alone', () => {
        const union: SchemaNode = { oneOf: [{ type: 'string' }, { type: 'integer' }] };

        expect(resolveSchema(union, spec)).toEqual(union);
    });

    it.each<[string, SchemaNode | undefined, boolean]>([
        ['the bare null type', { type: 'null' }, true],
        ['a type array with null', { type: ['string', 'null'] }, true],
        ['a plain string', { type: 'string' }, false],
        ['no schema', undefined, false]
    ])('isNullable: %s', (_name, node, expected) => {
        expect(isNullable(node)).toBe(expected);
    });
});

describe('unsupportedKeywords', () => {
    it('refuses a 3.0 `nullable`, which 3.1 ignores without a word', () => {
        // The cast is the point: `SchemaNode` no longer has `nullable`, and this is a 3.0 spec.
        const spec = specOf({ A: { type: 'string', nullable: true } as SchemaNode });

        expect(unsupportedKeywords(spec)).toEqual(['nullable']);
    });
});

describe('arbitraryFor', () => {
    it('sends null for a nullable field, and the field otherwise', () => {
        const draws = fc.sample(arbitraryFor({ type: ['string', 'null'], minLength: 1 }), 400);

        expect(draws).toContain(null);
        expect(draws.some((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    });

    it('never sends null for a field that is not nullable', () => {
        expect(fc.sample(arbitraryFor({ type: 'string' }), 400)).not.toContain(null);
    });

    it('sends only null for the bare null type', () => {
        expect(fc.sample(arbitraryFor({ type: 'null' }), 20)).toEqual(
            Array.from({ length: 20 }, () => null)
        );
    });

    it('draws null as well as a member of a nullable enum', () => {
        const draws = fc.sample(arbitraryFor({ type: ['string', 'null'], enum: ['a', 'b'] }), 400);

        expect(draws).toContain(null);
        expect(draws).toContain('a');
    });

    it('draws a wrapped nullable string as a string or null, never as an object', () => {
        const spec = specOf({ Locale: { type: 'string', pattern: '^[a-z]{2}$' } });
        const resolved = resolveSchema(
            { oneOf: [{ $ref: '#/components/schemas/Locale' }, { type: 'null' }] },
            spec
        );

        for (const value of fc.sample(arbitraryFor(resolved), 100))
            expect(value === null || typeof value === 'string').toBe(true);
    });

    it('draws a map of objects', () => {
        const draws = fc.sample(
            arbitraryFor({
                type: 'object',
                additionalProperties: {
                    type: ['object', 'null'],
                    properties: { x: { type: 'integer' } },
                    required: ['x']
                }
            }),
            50
        );

        expect(draws.some((value) => Object.keys(value as object).length > 0)).toBe(true);
    });
});

describe('securityRequiresAuth', () => {
    it.each([
        ['an absent security', undefined, false],
        ['an empty list', [], false],
        ['a session that is optional', [{}, { bearerAuth: [] }], false],
        ['a single required scheme', [{ bearerAuth: [] }], true],
        [
            'two alternative schemes, neither optional',
            [{ bearerAuth: [] }, { apiKeyAuth: [] }],
            true
        ],
        ['a cookie-only scheme', [{ cookieAuth: [] }], true]
    ])('reads %s', (_label, security, expected) => {
        expect(securityRequiresAuth(security)).toBe(expected);
    });
});
