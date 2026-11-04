/**
 * `withFilledEnums` — the post-bundle step that fills a schema marked `x-enum-from` with a list
 * that lives outside the contract.
 *
 * Driven with a minimal bundled document and a hand-made source, so the property under test is the
 * fill rule and its refusals, not the webhook events that happen to use it today.
 */

import { withFilledEnums } from '../../../../scripts/contracts/fill-enum';
import type { OpenApiDocument } from '../../../../scripts/contracts/openapi-document';
import { asStub } from '@tests/stub';

/** The sources the cases hand in. */
const SOURCES = { colours: ['red', 'green'], none: [] };

/** A document holding `schema` under a component and, nested, under a property. */
const bundle = (schema: Record<string, unknown>) =>
    asStub<OpenApiDocument>({
        openapi: '3.1.0',
        components: {
            schemas: {
                Colour: schema,
                Holder: { type: 'object', properties: { colour: structuredClone(schema) } }
            }
        }
    });

/** Fills a document in place and returns its schemas. */
const filled = (document: OpenApiDocument) => {
    withFilledEnums(document, SOURCES);
    return document.components?.schemas;
};

describe('withFilledEnums', () => {
    it('writes the source into an enum, wherever the placeholder sits, and spends the markers', () => {
        const schemas = filled(bundle({ type: 'string', 'x-enum-from': 'colours' }));

        expect(schemas?.Colour).toEqual({ type: 'string', enum: ['red', 'green'] });
        expect(schemas?.Holder).toEqual({
            type: 'object',
            properties: { colour: { type: 'string', enum: ['red', 'green'] } }
        });
    });

    it('appends the extra values after the source’s own', () => {
        const schemas = filled(
            bundle({ type: 'string', 'x-enum-from': 'colours', 'x-enum-also': ['*'] })
        );

        expect(schemas?.Colour).toHaveProperty('enum', ['red', 'green', '*']);
    });

    it('appends the source after a hand-written enum, keeping the written values first', () => {
        const schemas = filled(
            bundle({ type: 'string', enum: ['blue'], 'x-enum-from': 'colours' })
        );

        expect(schemas?.Colour).toEqual({ type: 'string', enum: ['blue', 'red', 'green'] });
    });

    it('keeps a hand-written enum whole when nobody supplies the source (the extender is gone)', () => {
        const schemas = filled(bundle({ type: 'string', enum: ['blue'], 'x-enum-from': 'shapes' }));

        expect(schemas?.Colour).toEqual({ type: 'string', enum: ['blue'] });
    });

    it('leaves a document with no placeholder as it was', () => {
        const plain = asStub<OpenApiDocument>({
            openapi: '3.1.0',
            components: { schemas: { A: { type: 'string' } } }
        });

        withFilledEnums(plain, SOURCES);

        expect(plain).toEqual({
            openapi: '3.1.0',
            components: { schemas: { A: { type: 'string' } } }
        });
    });

    it.each([
        ['an unknown source', { 'x-enum-from': 'shapes' }, /names no known source \(shapes\)/],
        ['an empty source', { 'x-enum-from': 'none' }, /source none is empty/],
        [
            'a written value the source repeats',
            { 'x-enum-from': 'colours', enum: ['red'] },
            /the same value twice/
        ],
        [
            'a written enum that is not strings',
            { 'x-enum-from': 'colours', enum: [1] },
            /must be a list of strings/
        ],
        [
            'a repeated value',
            { 'x-enum-from': 'colours', 'x-enum-also': ['red'] },
            /the same value twice/
        ],
        [
            'an appended list that is not strings',
            { 'x-enum-from': 'colours', 'x-enum-also': [1] },
            /list of strings/
        ]
    ])('refuses %s', (_label, schema, message) => {
        expect(() => withFilledEnums(bundle({ type: 'string', ...schema }), SOURCES)).toThrow(
            message
        );
    });
});
