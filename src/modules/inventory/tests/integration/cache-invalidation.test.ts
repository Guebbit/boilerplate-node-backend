/**
 * @module
 * A stock write leaves the catalogue's response cache alone: the product answer carries no stock
 * (availability is its own read, with its own per-product entry), so a receipt, an adjustment, a
 * sweep or a return's restock cannot make `GET /products/:id` or a list stale. What a write does
 * owe is the catalogue's synced copy of the counters, taken once per line of a multi-line checkout.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { withTransaction } from '@infrastructure/runtime/database';
import { inventoryService } from '../../services';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';
import { testCallerContext } from '@tests/callers';
import { productService } from '@modules/products';
import { reservationRepository } from '../../repository';
import { countersOf } from '@modules/products/tests/factories';

/**
 * Replaced, not spied on: a CommonJS namespace import exposes a non-configurable getter, which
 * `jest.spyOn` cannot redefine. See `tests/support/ports.ts`.
 */
jest.mock('@infrastructure/adapters/cache', () => ({
    __esModule: true,
    ...jest.requireActual<typeof import('@infrastructure/adapters/cache')>(
        '@infrastructure/adapters/cache'
    ),
    invalidateCacheTagsLogged: jest.fn(() => Promise.resolve())
}));

setupTestDb();

beforeEach(() => jest.mocked(invalidateCacheTagsLogged).mockClear());

afterEach(() => jest.restoreAllMocks());

/** A syntactically valid order id, distinct per call. */
let orderCounter = 0;

/** A fresh order id; the letter pads the id so files never collide on one. */
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'c');

describe('the products cache tag, left alone by stock writes', () => {
    it.each([
        ['received', (id: string) => inventoryService.receive(id, 4, undefined, testCallerContext)],
        ['adjusted', (id: string) => inventoryService.adjust(id, -2, undefined, testCallerContext)],
        [
            'put back by a return',
            (id: string) =>
                withTransaction((session) =>
                    inventoryService.restockReturnedLines(
                        [{ productId: id, quantity: 1 }],
                        { reference: anOrderId(), note: 'return' },
                        session
                    )
                ).then(() => inventoryService.refreshStockCacheForProducts([id]))
        ]
    ])('does not clear it when stock is %s', async (_how, write) => {
        const product = await createProduct({ onHand: 5 });

        await write(String(product._id));

        expect(invalidateCacheTagsLogged).not.toHaveBeenCalledWith(['products']);
    });
});

describe('a multi-line checkout syncs the catalogue copy of every line', () => {
    it('syncs every line, however many lines it has', async () => {
        const first = await createProduct({ onHand: 3 });
        const second = await createProduct({ onHand: 3 });
        const third = await createProduct({ onHand: 3 });
        const sync = jest.spyOn(productService, 'syncStockCache');

        const outcome = await inventoryService.reserveForOrder(
            anOrderId(),
            [first, second, third].map((p) => ({ productId: String(p._id), quantity: 1 }))
        );

        expect(outcome.held).toBe(true);
        expect(sync).toHaveBeenCalledTimes(3);
        await expect(countersOf(String(third._id))).resolves.toMatchObject({ reserved: 1 });
    });

    it('never fails the checkout when the catalogue write fails', async () => {
        const product = await createProduct({ onHand: 3 });
        jest.spyOn(productService, 'syncStockCache').mockRejectedValue(new Error('catalogue down'));

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 1 }
        ]);

        expect(outcome.held).toBe(true);
    });

    it('keeps syncing the other lines when one sync fails', async () => {
        const products = await Promise.all([
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 })
        ]);
        const sync = jest
            .spyOn(productService, 'syncStockCache')
            .mockRejectedValueOnce(new Error('catalogue down'));

        const outcome = await inventoryService.reserveForOrder(
            anOrderId(),
            products.map((p) => ({ productId: String(p._id), quantity: 1 }))
        );

        expect(outcome.held).toBe(true);
        expect(sync).toHaveBeenCalledTimes(3);
    });

    it('refreshes the lines already taken when giving them back fails', async () => {
        // Lines are taken in product-id order: the lower id is taken, the higher one is refused.
        const created = await Promise.all([
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 })
        ]);
        const [takenProduct, refusedProduct] = created.toSorted((a, b) =>
            String(a._id).localeCompare(String(b._id), 'en')
        );
        await inventoryService.adjust(String(refusedProduct._id), -3, undefined, testCallerContext);
        jest.spyOn(reservationRepository, 'claimStatus').mockRejectedValue(
            new Error('release down')
        );
        const sync = jest.spyOn(productService, 'syncStockCache');

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(takenProduct._id), quantity: 1 },
            { productId: String(refusedProduct._id), quantity: 1 }
        ]);

        expect(outcome.held).toBe(false);
        expect(sync).toHaveBeenCalledWith(
            String(takenProduct._id),
            expect.objectContaining({ reserved: 1 })
        );
    });
});
