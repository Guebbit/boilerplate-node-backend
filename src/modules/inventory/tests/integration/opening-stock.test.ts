/**
 * @module
 * The stock-level listener under the outbox's at-least-once delivery: a redelivered
 * `product.created` finds the level and changes nothing, and it never books a unit.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { PRODUCT_CREATED } from '@modules/products';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import inventoryModule from '../../module';
import { stockLevelRepository } from '../../repository';
import { inventoryService } from '../../services';
import { testCallerContext } from '@tests/callers';

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

/** The stored count, `undefined` when the product has no row. */
const onHandOf = (productId: string): Promise<number | undefined> =>
    stockLevelRepository.findByProductId(productId).then((level) => level?.onHand);

/** How many ledger rows the product has. */
const movementCount = (productId: string): Promise<number> =>
    inventoryService.listMovements({ productId }).then(({ items }) => items.length);

describe('PRODUCT_CREATED listener', () => {
    it('opens the level at zero and books no movement', async () => {
        const productId = await productWithoutLevel();

        await emitDomainEvent(PRODUCT_CREATED, { productId });

        expect(await onHandOf(productId)).toBe(0);
        expect(await movementCount(productId)).toBe(0);
    });

    it('opens it once when the same event is delivered twice, and leaves what a receipt booked', async () => {
        const productId = await productWithoutLevel();
        await emitDomainEvent(PRODUCT_CREATED, { productId });
        await inventoryService.receive(productId, 7, undefined, testCallerContext);

        await emitDomainEvent(PRODUCT_CREATED, { productId });

        expect(await onHandOf(productId)).toBe(7);
        expect(await movementCount(productId)).toBe(1);
    });
});
