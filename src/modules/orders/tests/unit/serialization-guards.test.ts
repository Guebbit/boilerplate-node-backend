/**
 * The defensive branches in this module's serialization transform.
 *
 * These are the "cannot happen" halves of guards, and they are exactly the halves nothing
 * exercised. That matters more here than it usually does, because the transform runs at the one
 * serialization point every response passes through: a transform that throws turns a successful
 * read into a 500 for every order in the collection, not for one.
 *
 * `applyOrderItems` and `applyOrderTotals` both guard on `Array.isArray(serialized.items)`, and
 * the reason is not paranoia — `items` is `select: false`-free but a projected query
 * (`.select('email createdAt')`) yields a document with no `items` at all, and the transform runs
 * on it just the same. The `!Array.isArray` branch is what keeps that from throwing; delete it
 * and the failure appears only on the projections, which is the hardest place to notice it.
 */
import { applyOrderTransform } from '@modules/orders/model';

describe('order serialization guards', () => {
    it('derives the three totals from the line items', () => {
        // The happy path, stated first so the guards below are read as the exceptions they are.
        const serialized: Record<string, unknown> = {
            items: [
                { product: { price: 10 }, quantity: 2 },
                { product: { price: 5 }, quantity: 3 }
            ]
        };

        applyOrderTransform(serialized);

        expect(serialized.totalItems).toBe(2);
        expect(serialized.totalQuantity).toBe(5);
        expect(serialized.totalPrice).toBe(35);
    });

    it('survives a projection that never selected items', () => {
        // `.select('email createdAt')` produces exactly this shape. Without the Array.isArray
        // guard the transform throws, and every projected order read becomes a 500.
        const serialized: Record<string, unknown> = { email: 'buyer@example.com' };

        expect(() => applyOrderTransform(serialized)).not.toThrow();
    });

    it('reports zero totals rather than omitting them when items are absent', () => {
        // `openapi.yaml` marks the three fields required, so "absent" is a contract violation
        // while "zero" is merely an empty order. The fallback to `[]` is what makes that true.
        const serialized: Record<string, unknown> = { email: 'buyer@example.com' };

        applyOrderTransform(serialized);

        expect(serialized.totalItems).toBe(0);
        expect(serialized.totalQuantity).toBe(0);
        expect(serialized.totalPrice).toBe(0);
    });

    it('strips a leftover _id from an embedded line item', () => {
        // Documents written before `orderItemSchema`'s `_id: false` took effect still carry one
        // at the BSON level, and the contract declares the item shape closed.
        const serialized: Record<string, unknown> = {
            items: [{ _id: 'legacy-id', product: { price: 1 }, quantity: 1 }]
        };

        applyOrderTransform(serialized);

        expect((serialized.items as Record<string, unknown>[])[0]).not.toHaveProperty('_id');
    });

    it('leaves a line item whose product was not populated alone', () => {
        // `item.product && typeof item.product === 'object'` — an unpopulated ref is an ObjectId
        // or a string, and recursing into it is what the guard prevents.
        const serialized: Record<string, unknown> = {
            items: [{ product: undefined, quantity: 1 }, { quantity: 2 }]
        };

        expect(() => applyOrderTransform(serialized)).not.toThrow();
    });

    it('tolerates items being present but not an array', () => {
        const serialized: Record<string, unknown> = { items: 'not-an-array' };

        expect(() => applyOrderTransform(serialized)).not.toThrow();
        expect(serialized.totalItems).toBe(0);
    });
});
