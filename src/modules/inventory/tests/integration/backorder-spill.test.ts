/**
 * @module
 * Reserving a line the shelf only half covers: the shelf part is taken, the rest is claimed
 * against the cap, and the hold says which is which, all in one transaction.
 *
 * See: docs/modules/inventory-reservations.md#preorders
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { inventoryService } from '../../services';
import { reservationRepository, stockLevelRepository } from '../../repository';

setupTestDb();

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'f');

/** A product with `shelf` units on hand and a cap of `limit` (`null` for none). */
const productWith = async (shelf: number, limit: number | null) => {
    const product = await createProduct({ onHand: shelf, allowBackorder: true });
    const productId = String(product._id);
    await inventoryService.setBackorderLimit(productId, limit);
    return productId;
};

/** A line that may spill past the shelf. */
const spilling = (productId: string, quantity: number) => ({
    productId,
    quantity,
    spill: true as const
});

/** The counters that show where units went. */
const levelOf = (productId: string) =>
    stockLevelRepository.findByProductId(productId).then((level) => ({
        reserved: level?.reserved,
        available: level?.available,
        backordered: level?.backordered
    }));

/** What the hold says it holds. */
const itemsOf = (orderId: string) =>
    reservationRepository
        .findByOrderId(orderId)
        .then((hold) => (hold?.items ?? []).map(({ quantity, kind }) => ({ quantity, kind })));

describe('reserving a line that may spill', () => {
    it('takes the whole line from the shelf when it fits, and owes nothing', async () => {
        const productId = await productWith(5, 10);
        const orderId = anOrderId();

        const outcome = await inventoryService.reserveForOrder(orderId, [spilling(productId, 3)]);

        expect(outcome).toMatchObject({ held: true, owed: [] });
        expect(await levelOf(productId)).toEqual({ reserved: 3, available: 2, backordered: 0 });
        expect(await itemsOf(orderId)).toEqual([{ quantity: 3, kind: 'stock' }]);
    });

    it('takes the two units there are and claims the third against the cap', async () => {
        const productId = await productWith(2, 10);
        const orderId = anOrderId();

        const outcome = await inventoryService.reserveForOrder(orderId, [spilling(productId, 3)]);

        expect(outcome).toMatchObject({ held: true, owed: [{ productId, quantity: 1 }] });
        expect(await levelOf(productId)).toEqual({ reserved: 2, available: 0, backordered: 1 });
        expect(await itemsOf(orderId)).toEqual([
            { quantity: 2, kind: 'stock' },
            { quantity: 1, kind: 'backorder' }
        ]);
    });

    it('claims the whole line against the cap when the shelf is empty', async () => {
        const productId = await productWith(0, 10);
        const orderId = anOrderId();

        const outcome = await inventoryService.reserveForOrder(orderId, [spilling(productId, 3)]);

        expect(outcome).toMatchObject({ held: true, owed: [{ productId, quantity: 3 }] });
        expect(await itemsOf(orderId)).toEqual([{ quantity: 3, kind: 'backorder' }]);
    });

    it('refuses when the shelf and the cap together cannot cover it, and takes nothing', async () => {
        const productId = await productWith(2, 0);
        const orderId = anOrderId();

        const outcome = await inventoryService.reserveForOrder(orderId, [spilling(productId, 3)]);

        expect(outcome).toMatchObject({
            held: false,
            shortfalls: [{ productId, requested: 3, available: 2 }]
        });
        expect(await levelOf(productId)).toEqual({ reserved: 0, available: 2, backordered: 0 });
        expect(await reservationRepository.findByOrderId(orderId)).toBeNull();
    });

    it('rolls the whole hold back when a later line is refused by its cap', async () => {
        const first = await productWith(5, 0);
        const second = await productWith(0, 1);
        const orderId = anOrderId();

        const outcome = await inventoryService.reserveForOrder(orderId, [
            { productId: first, quantity: 2 },
            spilling(second, 2)
        ]);

        expect(outcome).toMatchObject({ held: false });
        expect(await levelOf(first)).toEqual({ reserved: 0, available: 5, backordered: 0 });
        expect(await levelOf(second)).toEqual({ reserved: 0, available: 0, backordered: 0 });
    });

    it('serves two checkouts racing for the last unit: one takes it, the other owes it', async () => {
        const productId = await productWith(1, 10);
        const [a, b] = [anOrderId(), anOrderId()];

        const [first, second] = await Promise.all([
            inventoryService.reserveForOrder(a, [spilling(productId, 1)]),
            inventoryService.reserveForOrder(b, [spilling(productId, 1)])
        ]);

        expect(first).toMatchObject({ held: true });
        expect(second).toMatchObject({ held: true });
        const owedUnits = [first, second].flatMap((outcome) =>
            outcome.held ? outcome.owed.map(({ quantity }) => quantity) : []
        );
        expect(owedUnits).toEqual([1]);
        expect(await levelOf(productId)).toEqual({ reserved: 1, available: 0, backordered: 1 });
    });

    it('leaves nothing taken when the hold cannot be rewritten', async () => {
        const productId = await productWith(2, 10);
        const orderId = anOrderId();
        const rewrite = jest
            .spyOn(reservationRepository, 'replaceItems')
            .mockRejectedValueOnce(new Error('the rewrite failed'));

        await expect(
            inventoryService.reserveForOrder(orderId, [spilling(productId, 3)])
        ).rejects.toThrow('the rewrite failed');

        rewrite.mockRestore();
        expect(await levelOf(productId)).toEqual({ reserved: 0, available: 2, backordered: 0 });
        expect(await reservationRepository.findByOrderId(orderId)).toBeNull();
    });
});
