/**
 * @module
 * Who refreshes the catalogue's stock copy after a payment. A plain payment moves no counter, so
 * nothing needs refreshing. A payment that SERVES a preorder moves counters inside the payer's
 * transaction, where the copy cannot be written; the hold's owner announces it
 * (`backorder_allocated`) and this module refreshes that product's copy once the relay delivers.
 *
 * See: docs/modules/inventory.md#why-products-still-carries-a-copy
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { emitDomainEvent, markDomainEventsWired, resetDomainEvents } from '@kernel/events';
import { withTransaction } from '@infrastructure/runtime/database';
import inventoryModule from '../../module';
import { inventoryService } from '../../services';
import { PREORDER_ALLOCATED } from '../../events';

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    inventoryModule.subscribe();
    // A relay with nobody wired would leave every row pending: a real boot marks it, a test must.
    markDomainEventsWired();
});

afterEach(async () => {
    await settleOutboxNudges();
});

afterAll(() => resetDomainEvents());

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'd');

/** A product with no shelf stock and a preorder allowance of `limit`. */
const preorderProduct = async (limit: number): Promise<string> => {
    const product = await createProduct({ onHand: 0, allowBackorder: true });
    await inventoryService.setBackorderLimit(String(product._id), limit);
    return String(product._id);
};

describe('a payment that serves a preorder', () => {
    it('leaves the catalogue copy to the relay, which refreshes it from the announcement', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId, quantity: 2, kind: 'backorder' }
        ]);
        // The receipt finds only an unpaid hold, so nothing is allocated yet.
        await inventoryService.receive(productId, 4, undefined, testCallerContext);
        expect(await countersOf(productId)).toEqual({ onHand: 4, reserved: 0, available: 4 });

        // The payer's transaction: the counters move, the copy cannot be written from inside it.
        await withTransaction((session) => inventoryService.commitForOrder(orderId, session));
        expect(await countersOf(productId)).toEqual({ onHand: 4, reserved: 0, available: 4 });

        await relayOutbox();

        expect(await countersOf(productId)).toEqual({ onHand: 4, reserved: 2, available: 2 });
    });

    it('is refreshed by the announcement alone, for the product it names', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId, quantity: 2, kind: 'backorder' }
        ]);
        await inventoryService.receive(productId, 4, undefined, testCallerContext);
        await withTransaction((session) => inventoryService.commitForOrder(orderId, session));
        expect(await countersOf(productId)).toMatchObject({ reserved: 0 });

        await emitDomainEvent(PREORDER_ALLOCATED, { orderId, productId, waiting: 0 });

        expect(await countersOf(productId)).toMatchObject({ reserved: 2 });
    });
});

describe('a payment that serves nothing', () => {
    it('moves no counter and announces nothing', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [{ productId, quantity: 3 }]);

        await withTransaction((session) => inventoryService.commitForOrder(orderId, session));

        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 3, available: 7 });
        expect(await outboxEventModel.countDocuments({ name: PREORDER_ALLOCATED })).toBe(0);
    });
});
