/**
 * The spec walk and the arbitrary builder, on schemas written for the purpose.
 *
 * They are the fuzz suite's own foundation: if `allOf` collapsed or `nullable` were ignored the
 * fuzz would stay green while sending nothing useful, so each is pinned here where a failure
 * names the cause instead of an endpoint.
 */
import fc from 'fast-check';
import { resolveSchema, securityRequiresAuth, type SchemaNode } from '@tests/spec-walk';
import { arbitraryFor } from '@tests/spec-arbitraries';

/** A spec document with just the schemas a case needs. */
const specOf = (schemas: Record<string, SchemaNode>) => ({ paths: {}, components: { schemas } });

describe('resolveSchema: allOf', () => {
    const spec = specOf({
        Locale: { type: 'string', pattern: '^[a-z]{2}$' },
        Base: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
        Extra: { type: 'object', required: ['b'], properties: { b: { type: 'integer' } } }
    });

    it('keeps the scalar type and the pattern of a wrapped string, plus the sibling nullable', () => {
        const resolved = resolveSchema(
            { type: 'string', nullable: true, allOf: [{ $ref: '#/components/schemas/Locale' }] },
            spec
        );

        expect(resolved).toEqual({ type: 'string', pattern: '^[a-z]{2}$', nullable: true });
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

describe('arbitraryFor', () => {
    it('sends null for a nullable field, and the field otherwise', () => {
        const draws = fc.sample(
            arbitraryFor({ type: 'string', nullable: true, minLength: 1 }),
            400
        );

        expect(draws).toContain(null);
        expect(draws.some((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    });

    it('never sends null for a field that is not nullable', () => {
        expect(fc.sample(arbitraryFor({ type: 'string' }), 400)).not.toContain(null);
    });

    it('sends null for an enum that lists it', () => {
        expect(fc.sample(arbitraryFor({ nullable: true, enum: [null] }), 20)).toEqual(
            Array.from({ length: 20 }, () => null)
        );
    });

    it('draws a wrapped nullable string as a string or null, never as an object', () => {
        const spec = specOf({ Locale: { type: 'string', pattern: '^[a-z]{2}$' } });
        const resolved = resolveSchema(
            { type: 'string', nullable: true, allOf: [{ $ref: '#/components/schemas/Locale' }] },
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
                    type: 'object',
                    nullable: true,
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
