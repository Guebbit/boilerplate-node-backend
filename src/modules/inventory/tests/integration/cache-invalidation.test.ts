/**
 * @module
 * A stock write leaves the catalogue's response cache alone: the product answer carries no stock
 * (availability is its own read, with its own per-product entry), so a receipt, an adjustment, a
 * sweep or a return's restock cannot make `GET /products/:id` or a list stale. What a write does
 * owe is the deletion of the availability entry of every product it moved, once per line of a
 * multi-line checkout.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { withTransaction } from '@infrastructure/runtime/database';
import { inventoryService } from '../../services';
import { deleteCacheValues, invalidateCacheTagsLogged } from '@infrastructure/adapters/cache';
import { testCallerContext } from '@tests/callers';
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
    invalidateCacheTagsLogged: jest.fn(() => Promise.resolve()),
    deleteCacheValues: jest.fn(() => Promise.resolve())
}));

setupTestDb();

beforeEach(() => {
    jest.mocked(invalidateCacheTagsLogged).mockClear();
    jest.mocked(deleteCacheValues).mockClear();
});

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
                ).then(() => inventoryService.forgetAvailability([id]))
        ]
    ])('does not clear it when stock is %s', async (_how, write) => {
        const product = await createProduct({ onHand: 5 });

        await write(String(product._id));

        expect(invalidateCacheTagsLogged).not.toHaveBeenCalledWith(['products']);
    });
});

/** The cache key of one product's availability entry, as the stock funnel names it. */
const entryKeyOf = (product: { _id: unknown }) => `availability:${String(product._id)}`;

describe('a multi-line checkout clears the availability entry of every line', () => {
    it('clears every line, however many lines it has', async () => {
        const products = await Promise.all([
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 }),
            createProduct({ onHand: 3 })
        ]);

        const outcome = await inventoryService.reserveForOrder(
            anOrderId(),
            products.map((p) => ({ productId: String(p._id), quantity: 1 }))
        );

        expect(outcome.held).toBe(true);
        const cleared = jest.mocked(deleteCacheValues).mock.calls.flatMap(([keys]) => keys);
        expect(cleared).toEqual(expect.arrayContaining(products.map((p) => entryKeyOf(p))));
        await expect(countersOf(String(products[2]._id))).resolves.toMatchObject({ reserved: 1 });
    });

    it('clears the lines already taken when giving them back fails', async () => {
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
        jest.mocked(deleteCacheValues).mockClear();

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(takenProduct._id), quantity: 1 },
            { productId: String(refusedProduct._id), quantity: 1 }
        ]);

        expect(outcome.held).toBe(false);
        const cleared = jest.mocked(deleteCacheValues).mock.calls.flatMap(([keys]) => keys);
        expect(cleared).toContain(entryKeyOf(takenProduct));
    });
});
