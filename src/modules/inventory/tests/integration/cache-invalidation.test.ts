/**
 * @module
 * Every stock write clears the catalogue's response cache. `GET /products/:id` and the lists carry
 * `available`, so a receipt, an adjustment, a sweep or a return's restock that left them cached
 * would keep serving the old count until the TTL ran out.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { createProduct } from '@modules/products/tests/factories';
import {
    reserveForOrder,
    runReservationSweep,
    receive,
    adjust,
    restockReturnedLines,
    refreshStockCacheForProducts
} from '../../services';
import { invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';

/*
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

/** A syntactically valid order id, distinct per call. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'c');

describe('the products cache tag, cleared where stock is written', () => {
    it('clears it when stock is received', async () => {
        const product = await createProduct({ onHand: 1 });

        await receive(String(product._id), 4);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    it('clears it when stock is adjusted', async () => {
        const product = await createProduct({ onHand: 5 });

        await adjust(String(product._id), -2);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    it('clears it when the sweep releases an expired hold', async () => {
        const product = await createProduct({ onHand: 5 });
        // A zero-minute window: the hold is stale the moment it is taken.
        await withEnvironment('NODE_RESERVATION_TTL_MINUTES', '0', async () => {
            await reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 1 }]);
        });
        jest.mocked(invalidateCacheTagsLogged).mockClear();

        await expect(runReservationSweep()).resolves.toBe(1);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });

    it('clears it when a return puts goods back on the shelf', async () => {
        const product = await createProduct({ onHand: 5 });
        const productId = String(product._id);

        await restockReturnedLines([{ productId, quantity: 1 }], {
            reference: anOrderId(),
            note: 'return'
        });
        await refreshStockCacheForProducts([productId]);

        expect(invalidateCacheTagsLogged).toHaveBeenCalledWith(['products']);
    });
});
