/**
 * @module
 * `ExportOrder` and `OrderTimelineExportEntry` restate `Order` and `OrderTimelineEntry` flat
 * instead of composing them with `allOf`: two closed siblings can never validate together, and
 * the Zod generator cannot compose them. The two property lists exist twice, by hand, so this
 * test is what keeps them in step. It reads the module's own `openapi.yaml`, never the bundle.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

/** One object schema, as far as these checks look at it. */
interface ObjectSchema {
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
}

const spec = parse(readFileSync(path.resolve(__dirname, '../../openapi.yaml'), 'utf8')) as {
    components: { schemas: Record<string, ObjectSchema> };
};

const {
    Order: order,
    ExportOrder: exportOrder,
    OrderTimelineEntry: timelineEntry,
    OrderTimelineExportEntry: timelineExportEntry
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

    expect(exported.additionalProperties).toBe(false);
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
        expectMirror(order, exportOrder, 'actions', true);
    });

    it('requires `actions` on Order and never on the export', () => {
        expect(order.required).toContain('actions');
        expect(exportOrder.required).not.toContain('actions');
    });
});

describe('OrderTimelineExportEntry mirrors OrderTimelineEntry', () => {
    it('differs only by `orderId`', () => {
        expectMirror(timelineEntry, timelineExportEntry, 'orderId', false);
    });

    it('requires `orderId`', () => {
        expect(timelineExportEntry.required).toContain('orderId');
    });
});
