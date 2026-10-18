/**
 * @module
 * An unlimited cap (`backorderLimit: null`): units claimed without a ceiling, a closed cap (`0`)
 * that still refuses, and a level row that never had the field, which is closed, not open.
 *
 * See: docs/modules/inventory-reservations.md#preorders
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { stockLevelModel } from '../../model';
import { stockLevelRepository } from '../../repository';
import { inventoryService } from '../../services';

setupTestDb();

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'd');

/** One owed line. */
const claim = (productId: string, quantity: number) => ({
    productId,
    quantity,
    kind: 'backorder' as const
});

/** A product with no stock whose cap is `limit`. */
const productWithCap = async (limit: number | null) => {
    const product = await createProduct({ onHand: 0, allowBackorder: true });
    const productId = String(product._id);
    await inventoryService.setBackorderLimit(productId, limit);
    return productId;
};

describe('an unlimited backorder cap', () => {
    it('claims without a ceiling', async () => {
        const productId = await productWithCap(null);

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
            claim(productId, 1000)
        ]);

        expect(outcome).toMatchObject({ held: true });
        expect(await stockLevelRepository.findByProductId(productId)).toMatchObject({
            backorderLimit: null,
            backordered: 1000
        });
    });

    it('reads as unlimited room to the checkout pre-flight, never as sold out', async () => {
        const productId = await productWithCap(null);

        const room = await inventoryService.availableFor([productId], new Set([productId]));

        expect(room.get(productId)).toBe(Infinity);
    });

    it('sits on the board with no number left', async () => {
        const productId = await productWithCap(null);

        const { items } = await inventoryService.listPreorders();

        expect(items).toEqual([
            expect.objectContaining({ productId, backorderLimit: null, left: null })
        ]);
    });

    it('leaves the number out for a product that is neither a preorder nor open to backorder', async () => {
        const product = await createProduct({ onHand: 0 });
        const productId = String(product._id);
        await inventoryService.setBackorderLimit(productId, null);

        const { items } = await inventoryService.listPreorders();

        expect(items).toEqual([expect.not.objectContaining({ left: expect.anything() })]);
        expect(items[0]).toMatchObject({ productId, backorderLimit: null });
        expect(items[0]).not.toHaveProperty('left');
    });

    it('can be capped again, and the cap then holds', async () => {
        const productId = await productWithCap(null);
        await inventoryService.reserveForOrder(anOrderId(), [claim(productId, 3)]);
        await inventoryService.setBackorderLimit(productId, 4);

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [claim(productId, 2)]);

        expect(outcome).toMatchObject({ held: false, shortfalls: [{ available: 1 }] });
    });
});

describe('a closed backorder cap', () => {
    it('refuses with `0`', async () => {
        const productId = await productWithCap(0);

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [claim(productId, 1)]);

        expect(outcome).toMatchObject({ held: false, shortfalls: [{ available: 0 }] });
    });

    it('treats a level without the field as closed, not unlimited', async () => {
        const product = await createProduct({ onHand: 0 });
        const productId = String(product._id);
        await inventoryService.setBackorderLimit(productId, 5);
        // The raw driver, because the schema would put its default back.
        await stockLevelModel.collection.updateOne(
            { productId: product._id },
            { $unset: { backorderLimit: '' } }
        );

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [claim(productId, 1)]);

        expect(outcome).toMatchObject({ held: false });
    });
});
