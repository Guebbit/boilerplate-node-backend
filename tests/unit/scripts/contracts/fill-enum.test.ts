/**
 * `withFilledEnums` — the post-bundle step that fills a schema marked `x-enum-from` with a list
 * that lives outside the contract.
 *
 * Driven with a minimal bundled document and a hand-made source, so the property under test is the
 * fill rule and its refusals, not the webhook events that happen to use it today.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { withFilledEnums } from '../../../../scripts/contracts/fill-enum';

/** The sources the cases hand in. */
const SOURCES = { colours: ['red', 'green'], none: [] };

/** A document holding `schema` under a component and, nested, under a property. */
const bundle = (schema: Record<string, unknown>) =>
    stringifyYaml({
        openapi: '3.1.0',
        components: {
            schemas: {
                Colour: schema,
                Holder: { type: 'object', properties: { colour: schema } }
            }
        }
    });

/** Parsed-back schemas, typed only as far as the assertions read. */
const filled = (yaml: string) =>
    (
        parseYaml(withFilledEnums(yaml, SOURCES)) as {
            components: { schemas: Record<string, Record<string, unknown>> };
        }
    ).components.schemas;

describe('withFilledEnums', () => {
    it('writes the source into an enum, wherever the placeholder sits, and spends the markers', () => {
        const schemas = filled(bundle({ type: 'string', 'x-enum-from': 'colours' }));

        expect(schemas.Colour).toEqual({ type: 'string', enum: ['red', 'green'] });
        expect(schemas.Holder).toEqual({
            type: 'object',
            properties: { colour: { type: 'string', enum: ['red', 'green'] } }
        });
    });

    it('appends the extra values after the source’s own', () => {
        const schemas = filled(
            bundle({ type: 'string', 'x-enum-from': 'colours', 'x-enum-also': ['*'] })
        );

        expect(schemas.Colour?.enum).toEqual(['red', 'green', '*']);
    });

    it('leaves a document with no placeholder as it was', () => {
        const plain = stringifyYaml({
            openapi: '3.1.0',
            components: { schemas: { A: { type: 'string' } } }
        });

        expect(parseYaml(withFilledEnums(plain, SOURCES))).toEqual(parseYaml(plain));
    });

    it.each([
        ['an unknown source', { 'x-enum-from': 'shapes' }, /names no known source \(shapes\)/],
        ['an empty source', { 'x-enum-from': 'none' }, /source none is empty/],
        [
            'a hand-written enum beside it',
            { 'x-enum-from': 'colours', enum: ['x'] },
            /cannot both stand/
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
