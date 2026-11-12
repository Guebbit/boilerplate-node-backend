/**
 * @module
 * The catalogue's stock copy must never go backwards.
 *
 * Two buyers reserve the last two units one after the other, but the FIRST buyer's copy-write is
 * parked until the second has finished. Without a version guard the older snapshot lands last: the
 * shop shows a unit left that does not exist, and a false "back in stock" event is queued.
 *
 * The interleaving is forced with a gate on `productService.syncStockCache`, so it is the same on
 * every run instead of depending on the scheduler.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { PRODUCT_BUYABLE_AGAIN, productService } from '@modules/products';
import { outboxEventModel } from '@kernel/outbox';
import { inventoryService } from '../../services';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/**
 * Park the next `syncStockCache` call until `release` is called, then let it run for real with
 * the snapshot it already holds. Own method of a plain object, so `jest.spyOn` is safe under the
 * swc mutation harness.
 *
 * @returns `parked` settles once the call is waiting; `release` lets it through
 */
const parkNextCacheWrite = (): { parked: Promise<void>; release: () => void } => {
    const realSync = productService.syncStockCache;
    const latch: { release?: () => void; markParked?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
        latch.release = resolve;
    });
    const parked = new Promise<void>((resolve) => {
        latch.markParked = resolve;
    });

    jest.spyOn(productService, 'syncStockCache').mockImplementationOnce((productId, counters) => {
        latch.markParked?.();
        return gate.then(() => realSync(productId, counters));
    });

    return { parked, release: () => latch.release?.() };
};

describe('the product copy of the stock counters', () => {
    it('keeps the newer snapshot when an older write arrives late, and queues no false restock', async () => {
        const product = await createProduct({ onHand: 2 });
        const productId = String(product._id);
        const gate = parkNextCacheWrite();

        // First buyer: its copy-write waits at the gate, holding the older snapshot.
        const first = inventoryService.reserveForOrder('a'.repeat(24), [
            { productId, quantity: 1 }
        ]);
        await gate.parked;

        // Second buyer finishes completely: the copy now shows both units claimed.
        await inventoryService.reserveForOrder('b'.repeat(24), [{ productId, quantity: 1 }]);
        expect(await countersOf(productId)).toEqual({ onHand: 2, reserved: 2, available: 0 });

        // The older write arrives last and must change nothing.
        gate.release();
        await first;

        expect(await countersOf(productId)).toEqual({ onHand: 2, reserved: 2, available: 0 });
        expect(
            await outboxEventModel.countDocuments({
                name: PRODUCT_BUYABLE_AGAIN,
                aggregateId: productId
            })
        ).toBe(0);
    });
});
