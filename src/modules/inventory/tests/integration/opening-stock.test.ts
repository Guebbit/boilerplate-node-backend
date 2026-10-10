/**
 * @module
 * The opening-stock listener under the outbox's at-least-once delivery: a redelivered
 * `product.created` must book the opening count once, and a product created at zero books none.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { PRODUCT_CREATED } from '@modules/products';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import inventoryModule from '../../module';
import { stockLevelRepository } from '../../repository';
import { listMovements } from '../../services';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    inventoryModule.subscribe();
});

afterAll(() => resetDomainEvents());

/** A product with no level row yet, as a real create leaves it before the relay delivers. */
const productWithoutLevel = async (): Promise<string> => {
    const product = await createProduct({ onHand: 0 });
    await stockLevelRepository.deleteByProductId(String(product._id));
    return String(product._id);
};

/** The stored opening count, `undefined` when the product has no row. */
const onHandOf = (productId: string): Promise<number | undefined> =>
    stockLevelRepository.findByProductId(productId).then((level) => level?.onHand);

/** How many ledger rows the product has. */
const movementCount = (productId: string): Promise<number> =>
    listMovements({ productId }).then(({ items }) => items.length);

describe('PRODUCT_CREATED listener', () => {
    it('books the opening stock once when the same event is delivered twice', async () => {
        const productId = await productWithoutLevel();

        await emitDomainEvent(PRODUCT_CREATED, { productId, onHand: 7 });
        await emitDomainEvent(PRODUCT_CREATED, { productId, onHand: 7 });

        expect(await onHandOf(productId)).toBe(7);
        expect(await movementCount(productId)).toBe(1);
    });

    it('creates the row but books no movement for a product created with zero', async () => {
        const productId = await productWithoutLevel();

        await emitDomainEvent(PRODUCT_CREATED, { productId, onHand: 0 });

        expect(await onHandOf(productId)).toBe(0);
        expect(await movementCount(productId)).toBe(0);
    });
});
