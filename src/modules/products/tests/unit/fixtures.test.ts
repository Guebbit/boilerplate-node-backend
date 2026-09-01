/**
 * @module
 * `makeProduct` — the catalogue fixture builder. Not test-only: `demo.ts` seeds the shipped demo
 * dataset through it, and `scripts/export-demo-dataset.ts` publishes the result as
 * `db/demo/demo-data.json`, so a defect here reaches a published artifact. The rule it holds:
 * anything a record doesn't state is left to the SCHEMA's `default:` — `stripUndefined` drops
 * unset overrides entirely, since a key present as `undefined` blocks Mongoose's default from
 * applying.
 */

import { Types } from 'mongoose';
import { makeProduct } from '@modules/products/fixtures';

const HEX = '65dc8a99604c307b702b5ccc';

describe('makeProduct', () => {
    it('builds a complete, insertable product with no overrides at all', () => {
        const product = makeProduct();

        // Title and price are the schema's two required fields, so the bare fixture has to carry
        // both or every `makeProduct()` in the suite is an invalid document.
        expect(product._id).toBeInstanceOf(Types.ObjectId);
        expect(product.title).toBe('Test Product');
        expect(product.price).toBe(9.99);
    });

    it('takes the id it is given, as a real ObjectId', () => {
        expect(String(makeProduct({ id: HEX })._id)).toBe(HEX);
    });

    it('lets an override replace a default', () => {
        const product = makeProduct({ title: 'Sallyno Panino', price: 100 });

        expect(product.title).toBe('Sallyno Panino');
        expect(product.price).toBe(100);
    });

    it('omits unspecified fields entirely, leaving them to the schema', () => {
        // The whole point of `stripUndefined`. `active: undefined` present as a key would store nothing
        // and bypass the schema's `default: true`, producing an unpublished product no test asked
        // for — and, through the seed export, a demo catalogue nobody can see.
        const product = makeProduct();

        for (const field of ['active', 'onHand', 'reserved', 'categories', 'tags', 'description'])
            expect(Object.hasOwn(product, field)).toBe(false);
    });

    it('keeps a false or zero override rather than treating it as unspecified', () => {
        // `active: false` and `onHand: 0` are the two fixtures the visibility and out-of-stock
        // branches need. Compacting on falsiness rather than on `undefined` would silently drop
        // exactly those.
        const product = makeProduct({ active: false, onHand: 0 });

        expect(product.active).toBe(false);
        expect(product.onHand).toBe(0);
    });

    it('converts a soft-delete timestamp from the ISO string a seed file writes', () => {
        // The schema stores a `Date`; the seed files state strings. Without `toDate` the fixture
        // stores a string in a `Date` path and the soft-delete branch it exists to cover is
        // never exercised.
        const product = makeProduct({ deletedAt: '2026-08-27T10:00:00.000Z' });

        expect(product.deletedAt).toBeInstanceOf(Date);
        expect(product.deletedAt!.toISOString()).toBe('2026-08-27T10:00:00.000Z');
    });

    it('dates a record from its own id when no timestamps are stated', () => {
        const product = makeProduct({ id: HEX });

        expect(product.createdAt!.getTime()).toBe(new Types.ObjectId(HEX).getTimestamp().getTime());
    });
});
