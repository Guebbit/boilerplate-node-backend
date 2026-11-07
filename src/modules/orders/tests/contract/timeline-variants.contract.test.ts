/**
 * @module
 * The timeline entry is one `oneOf` per surface (the API's and the export's), each variant a
 * hand-written `allOf` of a base and its own `type` + `data`. Nothing generates the variants, so
 * this test is what keeps them honest: they split `OrderTimelineType` exactly, the discriminator
 * `mapping` names every type once, and the export's variants mirror the entry's. It reads the
 * module's own `openapi.yaml`; the closing rule is checked on the root bundle, which is what
 * consumers (a twin, an integrator, a docs tool) read.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { TIMELINE_AUDIENCE } from '../../domain';

/** The few schema fields these checks look at. */
interface Schema {
    enum?: string[];
    $ref?: string;
    allOf?: Schema[];
    oneOf?: Schema[];
    properties?: Record<string, Schema>;
    additionalProperties?: boolean;
    unevaluatedProperties?: boolean;
    discriminator?: { propertyName: string; mapping: Record<string, string> };
}

const {
    components: { schemas }
} = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as {
    components: { schemas: Record<string, Schema> };
};

/** The name a local `$ref` points at. */
const nameOf = (ref: string | undefined): string => (ref ?? '').split('/').pop() ?? '';

/** The contract's own list of types, which the variants must split. */
const { enum: allTypes = [] } = schemas.OrderTimelineType;

/** One surface: its union, the base each variant composes, and the variants read out. */
const surfaces = [
    { union: 'OrderTimelineEntry', base: 'OrderTimelineEntryBase' },
    { union: 'OrderTimelineExportEntry', base: 'OrderTimelineExportEntryBase' }
].map(({ union, base }) => {
    const members = (schemas[union].oneOf ?? []).map((member) => nameOf(member.$ref));
    const variants = members.map((name) => {
        const [composed, own] = schemas[name].allOf ?? [];
        return {
            name,
            base: nameOf(composed.$ref),
            types: own.properties?.type.enum ?? [],
            data: nameOf(own.properties?.data.$ref)
        };
    });
    return { union, base, members, variants, mapping: schemas[union].discriminator?.mapping ?? {} };
});

describe.each(surfaces)('$union', ({ union, base, members, variants, mapping }) => {
    it('discriminates on `type`', () => {
        expect(schemas[union].discriminator?.propertyName).toBe('type');
    });

    it('splits OrderTimelineType exactly: every type in one variant, none in two', () => {
        expect(variants.flatMap((variant) => variant.types).toSorted()).toEqual(
            allTypes.toSorted()
        );
    });

    it('maps every type to the variant that holds it, and only those', () => {
        expect(Object.keys(mapping).toSorted()).toEqual(allTypes.toSorted());
        for (const variant of variants)
            for (const type of variant.types) expect(nameOf(mapping[type])).toBe(variant.name);
        expect(new Set(Object.values(mapping).map((ref) => nameOf(ref)))).toEqual(new Set(members));
    });

    it('composes its own base directly, one level deep', () => {
        for (const variant of variants) {
            expect(variant.base).toBe(base);
            expect(schemas[base].allOf).toBeUndefined();
        }
    });

    it('points every variant at a data schema that exists', () => {
        for (const variant of variants) expect(schemas[variant.data]).toBeDefined();
    });
});

describe('the export mirrors the entry', () => {
    it('has the same variants, over the same types and data', () => {
        const [entry, exported] = surfaces;
        const shape = (variants: typeof entry.variants) =>
            variants.map(({ types, data }) => ({ types, data }));

        expect(shape(exported.variants)).toEqual(shape(entry.variants));
    });
});

/** The variant names, per surface, whose own branch declares a `text` property. */
const withText = (union: string): string[] =>
    (schemas[union].oneOf ?? [])
        .map((member) => nameOf(member.$ref))
        .filter((name) => schemas[name].allOf?.[1].properties?.text !== undefined)
        .toSorted();

describe('`text` on the variants', () => {
    it('lets only the staff-text variants carry it, the same on both surfaces', () => {
        expect(withText('OrderTimelineEntry')).toEqual([
            'OrderTimelineEntryNoteAdded',
            'OrderTimelineEntryStatusOverridden'
        ]);
        expect(withText('OrderTimelineExportEntry')).toEqual(
            withText('OrderTimelineEntry').map((name) => name.replace('Entry', 'ExportEntry'))
        );
    });
});

describe('the audience table', () => {
    it('keeps staff notes private to staff', () => {
        expect(TIMELINE_AUDIENCE.note_added).toBe('staff');
    });

    it('decides every type the contract names, and no other', () => {
        expect(Object.keys(TIMELINE_AUDIENCE).toSorted()).toEqual(allTypes.toSorted());
    });
});

describe('closing the entry (JSON Schema 2020-12, as the bundle ships it)', () => {
    const { components: bundled } = parse(
        readFileSync(path.resolve(__dirname, '../../../../../openapi.yaml'), 'utf8')
    ) as { components: { schemas: Record<string, Schema> } };

    it('leaves both bases open: a closed base would refuse its own variants', () => {
        for (const { base } of surfaces) {
            expect(bundled.schemas[base]).toBeDefined();
            expect(bundled.schemas[base].additionalProperties).toBeUndefined();
        }
    });

    it('closes every variant as a whole with unevaluatedProperties', () => {
        for (const { variants } of surfaces)
            for (const { name } of variants) {
                expect(bundled.schemas[name].unevaluatedProperties).toBe(false);
                expect(bundled.schemas[name].additionalProperties).toBeUndefined();
            }
    });
});
