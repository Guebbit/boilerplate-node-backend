/**
 * @module
 * Every stock write clears the catalogue's response cache. `GET /products/:id` and the lists carry
 * `available`, so a receipt, an adjustment, a sweep or a return's restock that left them cached
 * would keep serving the old count until the TTL ran out.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
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

describe('the products cache tag, cleared where stock is written', () => {
    it('clears it when stock is received', async () => {
        const product = await createProduct({ onHand: 1 });

        await inventoryService.receive(String(product._id), 4, undefined, testCallerContext);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    it('clears it when stock is adjusted', async () => {
        const product = await createProduct({ onHand: 5 });

        await inventoryService.adjust(String(product._id), -2, undefined, testCallerContext);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    it('clears it when the sweep releases an expired hold', async () => {
        const product = await createProduct({ onHand: 5 });
        // A zero-minute window: the hold is stale the moment it is taken.
        await withEnvironmentOverrides({ NODE_RESERVATION_TTL_MINUTES: '0' }, async () => {
            await inventoryService.reserveForOrder(anOrderId(), [
                { productId: String(product._id), quantity: 1 }
            ]);
        });
        jest.mocked(invalidateCacheTagsLogged).mockClear();

        await expect(inventoryService.runReservationSweep()).resolves.toBe(1);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    it('clears it when a return puts goods back on the shelf', async () => {
        const product = await createProduct({ onHand: 5 });
        const productId = String(product._id);

        await withTransaction((session) =>
            inventoryService.restockReturnedLines(
                [{ productId, quantity: 1 }],
                { reference: anOrderId(), note: 'return' },
                session
            )
        );
        await inventoryService.refreshStockCacheForProducts([productId]);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });
});

describe('a multi-line checkout refreshes the catalogue once', () => {
    it('clears the tag once and syncs every line, however many lines it has', async () => {
        const first = await createProduct({ onHand: 3 });
        const second = await createProduct({ onHand: 3 });
        const third = await createProduct({ onHand: 3 });
        jest.mocked(invalidateCacheTagsLogged).mockClear();
        const sync = jest.spyOn(productService, 'syncStockCache');

        const outcome = await inventoryService.reserveForOrder(
            anOrderId(),
            [first, second, third].map((p) => ({ productId: String(p._id), quantity: 1 }))
        );

        expect(outcome.held).toBe(true);
        expect(invalidateCacheTagsLogged).toHaveBeenCalledTimes(1);
        expect(sync).toHaveBeenCalledTimes(3);
        await expect(countersOf(String(third._id))).resolves.toMatchObject({ reserved: 1 });
    });

    it('never fails the checkout when the catalogue write fails', async () => {
        const product = await createProduct({ onHand: 3 });
        jest.spyOn(productService, 'syncStockCache').mockRejectedValue(new Error('catalogue down'));
        jest.mocked(invalidateCacheTagsLogged).mockClear();

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 1 }
        ]);

        expect(outcome.held).toBe(true);
        // No sync landed, so there is nothing stale to clear.
        expect(invalidateCacheTagsLogged).not.toHaveBeenCalled();
    });

    it('keeps syncing the other lines when one sync fails, and clears the tag once', async () => {
        const products = await Promise.all([
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 })
        ]);
        jest.mocked(invalidateCacheTagsLogged).mockClear();
        const sync = jest
            .spyOn(productService, 'syncStockCache')
            .mockRejectedValueOnce(new Error('catalogue down'));

        const outcome = await inventoryService.reserveForOrder(
            anOrderId(),
            products.map((p) => ({ productId: String(p._id), quantity: 1 }))
        );

        expect(outcome.held).toBe(true);
        expect(sync).toHaveBeenCalledTimes(3);
        expect(invalidateCacheTagsLogged).toHaveBeenCalledTimes(1);
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
