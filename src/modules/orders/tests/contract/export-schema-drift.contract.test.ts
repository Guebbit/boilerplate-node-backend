/**
 * @module
 * `ExportOrder` and `OrderTimelineExportEntryBase` restate `Order` and `OrderTimelineEntryBase`
 * flat instead of composing them with `allOf`: two closed siblings can never validate together,
 * and the Zod generator cannot compose them (the timeline bases are open for that reason, and the
 * variants close the whole entry). The two property lists exist twice, by hand, so this
 * test is what keeps them in step. It reads the module's own `openapi.yaml`, never the bundle.
 * The timeline's variants on top of those bases are `timeline-variants.contract.test.ts`.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** One object schema, as far as these checks look at it. */
interface ObjectSchema {
    /** The declared fields, by name. */
    properties: Record<string, unknown>;
    /** Field names that must be present. */
    required?: string[];
    /** `false` refuses unknown keys. */
    additionalProperties?: boolean;
}

/** The module contract, parsed from its own openapi.yaml. */
const spec = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as {
    components: { schemas: Record<string, ObjectSchema> };
};

/** The order and export schemas the drift checks compare, picked out of the contract. */
const {
    Order: order,
    ExportOrder: exportOrder,
    OrderTimelineEntryBase: timelineEntry,
    OrderTimelineExportEntryBase: timelineExportEntry
} = spec.components.schemas;

/**
 * Asserts the export schema equals its source apart from the one field the export differs by.
 * @param source - the schema served on the API
 * @param exported - its flat export restatement
 * @param field - the single field allowed to differ between the two
 * @param inSource - whether that field lives on the source (`actions`) or the export (`orderId`)
 */
const expectMirror = (
    source: ObjectSchema,
    exported: ObjectSchema,
    field: string,
    inSource: boolean
): void => {
    const [bigger, smaller] = inSource ? [source, exported] : [exported, source];
    const skip = (names: string[]): string[] => names.filter((name) => name !== field);

    expect(Object.keys(bigger.properties)).toContain(field);
    expect(skip(Object.keys(bigger.properties)).toSorted()).toEqual(
        Object.keys(smaller.properties).toSorted()
    );
    expect(skip(bigger.required ?? []).toSorted()).toEqual(
        [...(smaller.required ?? [])].toSorted()
    );
    // Same definition for every shared field, not just the same name.
    for (const name of Object.keys(smaller.properties))
        expect(exported.properties[name]).toEqual(source.properties[name]);
};

describe('ExportOrder mirrors Order', () => {
    it('differs only by `actions`', () => {
        expect(exportOrder.additionalProperties).toBe(false);
        expectMirror(order, exportOrder, 'actions', true);
    });

    it('requires `actions` on Order and never on the export', () => {
        expect(order.required).toContain('actions');
        expect(exportOrder.required).not.toContain('actions');
    });
});

describe('OrderTimelineExportEntryBase mirrors OrderTimelineEntryBase', () => {
    it('differs only by `orderId`', () => {
        expectMirror(timelineEntry, timelineExportEntry, 'orderId', false);
    });

    it('requires `orderId`', () => {
        expect(timelineExportEntry.required).toContain('orderId');
    });
});
