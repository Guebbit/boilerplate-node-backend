/**
 * @module
 * The preorder allowance, end to end through the service doors: a claim against `preorderLimit`
 * (never the shelf), the payment that stamps the queue key, the receipt that allocates oldest
 * payment first in its own transaction, and what a release or an expiry gives back.
 *
 * See: docs/modules/inventory-reservations.md#preorders
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { createProduct } from '@modules/products/tests/factories';
import { outboxEventModel } from '@kernel/outbox';
import { withTransaction } from '@infrastructure/runtime/database';
import { StockMovementReason } from '@types';
import {
    availableFor,
    commitForOrder,
    listPreorders,
    lowStockCount,
    receive,
    releaseCommittedForOrder,
    releaseForOrder,
    releaseLinesForOrder,
    reserveForOrder,
    runReservationSweep,
    setPreorderLimit,
    shipLinesForOrder
} from '../../services';
import {
    reservationRepository,
    stockLevelRepository,
    stockMovementRepository
} from '../../repository';
import { PREORDER_ALLOCATED } from '../../events';

setupTestDb();

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'c');

/** The level's three counters that matter here. */
const levelOf = (productId: string) =>
    stockLevelRepository.findByProductId(productId).then((level) => ({
        onHand: level?.onHand,
        reserved: level?.reserved,
        preordered: level?.preordered,
        preorderLimit: level?.preorderLimit
    }));

/** A product with no stock and an allowance of `limit`, the shape a preorder is sold in. */
const preorderProduct = async (limit: number) => {
    const product = await createProduct({ onHand: 0 });
    const productId = String(product._id);
    await setPreorderLimit(productId, limit);
    return productId;
};

/** One preorder line. */
const claim = (productId: string, quantity: number) => ({
    productId,
    quantity,
    kind: 'preorder' as const
});

/** What `preorder_allocated` events were written, in order. */
const announced = () =>
    outboxEventModel
        .find({ name: PREORDER_ALLOCATED })
        .sort({ _id: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map(({ payload }) => payload));

describe('reserving a preorder', () => {
    it('claims the allowance and leaves the shelf alone', async () => {
        const productId = await preorderProduct(5);

        const outcome = await reserveForOrder(anOrderId(), [claim(productId, 3)]);

        expect(outcome).toMatchObject({ held: true });
        expect(await levelOf(productId)).toEqual({
            onHand: 0,
            reserved: 0,
            preordered: 3,
            preorderLimit: 5
        });
    });

    it('refuses what the allowance cannot cover, reporting what is left of it', async () => {
        const productId = await preorderProduct(5);
        await reserveForOrder(anOrderId(), [claim(productId, 3)]);

        const outcome = await reserveForOrder(anOrderId(), [claim(productId, 3)]);

        expect(outcome).toMatchObject({
            held: false,
            shortfalls: [{ productId, requested: 3, available: 2 }]
        });
        expect(await levelOf(productId)).toMatchObject({ preordered: 3 });
    });

    it('refuses a preorder on a product that has no allowance at all', async () => {
        const product = await createProduct({ onHand: 0 });

        const outcome = await reserveForOrder(anOrderId(), [claim(String(product._id), 1)]);

        expect(outcome).toMatchObject({ held: false });
    });

    it('does not sell the shelf against the allowance: stock on hand is not preorder room', async () => {
        const product = await createProduct({ onHand: 50 });
        const productId = String(product._id);
        await setPreorderLimit(productId, 2);

        const outcome = await reserveForOrder(anOrderId(), [claim(productId, 3)]);

        expect(outcome).toMatchObject({ held: false, shortfalls: [{ available: 2 }] });
    });

    it('records the claim in its own ledger column', async () => {
        const productId = await preorderProduct(5);

        await reserveForOrder(anOrderId(), [claim(productId, 2)]);

        const { items } = await stockMovementRepository.search({ productId });
        expect(items).toMatchObject([
            {
                reason: StockMovementReason.preorder,
                onHandDelta: 0,
                reservedDelta: 0,
                preorderedDelta: 2
            }
        ]);
    });

    it('rolls a claim back when another line of the same order is refused', async () => {
        const productId = await preorderProduct(5);
        const scarce = await createProduct({ onHand: 0 });

        const outcome = await reserveForOrder(anOrderId(), [
            claim(productId, 2),
            { productId: String(scarce._id), quantity: 1 }
        ]);

        expect(outcome).toMatchObject({ held: false });
        expect(await levelOf(productId)).toMatchObject({ preordered: 0 });
    });
});

describe('giving a preorder claim back', () => {
    it('release gives the allowance back, never `reserved`', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 3)]);

        expect(await releaseForOrder(orderId)).toBe(true);

        expect(await levelOf(productId)).toMatchObject({ reserved: 0, preordered: 0 });
    });

    it('expiry of an unpaid hold gives the allowance back', async () => {
        const productId = await preorderProduct(5);
        await withEnvironment('NODE_RESERVATION_TTL_MINUTES', '0', async () => {
            await reserveForOrder(anOrderId(), [claim(productId, 3)]);
        });

        await runReservationSweep();

        expect(await levelOf(productId)).toMatchObject({ reserved: 0, preordered: 0 });
    });

    it('a paid order cancelled before stock arrives gives the allowance back', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 3)]);
        await commitForOrder(orderId);

        expect(await releaseCommittedForOrder(orderId)).toBe(true);

        expect(await levelOf(productId)).toMatchObject({ reserved: 0, preordered: 0 });
    });

    it('a remainder cancel of a preorder line gives back the allowance, and of a stock line the shelf', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 3)]);
        await commitForOrder(orderId);

        await withTransaction((session) =>
            releaseLinesForOrder(orderId, [claim(productId, 2)], session)
        );

        expect(await levelOf(productId)).toMatchObject({ reserved: 0, preordered: 1 });
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.items).toMatchObject([{ quantity: 1, kind: 'preorder' }]);
    });
});

describe('paying for a preorder', () => {
    it('stamps the hold with the payment instant, the queue key', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        const before = Date.now();
        await reserveForOrder(orderId, [claim(productId, 1)]);

        await commitForOrder(orderId);

        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.status).toBe('committed');
        expect(hold?.committedAt?.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('serves a paid preorder at once when stock already arrived while it was unpaid', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 2)]);
        // The receipt finds only unpaid holds, so nothing is allocated yet.
        await receive(productId, 4);
        expect(await levelOf(productId)).toMatchObject({ reserved: 0, preordered: 2 });

        await commitForOrder(orderId);

        expect(await levelOf(productId)).toMatchObject({ onHand: 4, reserved: 2, preordered: 0 });
        expect(await announced()).toEqual([{ orderId, productId, waiting: 0 }]);
    });
});

describe('a receipt serving the queue', () => {
    it('allocates oldest payment first, not oldest order', async () => {
        const productId = await preorderProduct(10);
        const first = anOrderId();
        const second = anOrderId();
        // Ordered first, paid last.
        await reserveForOrder(first, [claim(productId, 2)]);
        await reserveForOrder(second, [claim(productId, 2)]);
        await commitForOrder(second);
        await commitForOrder(first);

        await receive(productId, 2);

        expect(await announced()).toEqual([{ orderId: second, productId, waiting: 0 }]);
        const served = await reservationRepository.findByOrderId(second);
        const waiting = await reservationRepository.findByOrderId(first);
        expect(served?.items).toMatchObject([{ quantity: 2, kind: 'stock' }]);
        expect(waiting?.items).toMatchObject([{ quantity: 2, kind: 'preorder' }]);
    });

    it('splits a short delivery: the order gets what exists and keeps waiting for the rest', async () => {
        const productId = await preorderProduct(10);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 3)]);
        await commitForOrder(orderId);

        await receive(productId, 2);

        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.items).toMatchObject([
            { quantity: 1, kind: 'preorder' },
            { quantity: 2, kind: 'stock' }
        ]);
        expect(await announced()).toEqual([{ orderId, productId, waiting: 1 }]);
        expect(await levelOf(productId)).toMatchObject({ onHand: 2, reserved: 2, preordered: 1 });
    });

    it('turns the claim into a real hold without making the units sellable in between', async () => {
        const productId = await preorderProduct(10);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 2)]);
        await commitForOrder(orderId);

        await receive(productId, 2);

        const level = await stockLevelRepository.findByProductId(productId);
        expect(level?.available).toBe(0);
        const { items } = await stockMovementRepository.search({ productId });
        expect(items.map(({ reason }) => reason).toSorted()).toEqual(
            [
                StockMovementReason.preorder,
                StockMovementReason.receive,
                StockMovementReason.allocate
            ].toSorted()
        );
    });

    it('leaves the surplus sellable once every paid preorder is served', async () => {
        const productId = await preorderProduct(10);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 2)]);
        await commitForOrder(orderId);

        await receive(productId, 5);

        const level = await stockLevelRepository.findByProductId(productId);
        expect(level?.available).toBe(3);
    });

    it('does not serve a preorder that is still unpaid', async () => {
        const productId = await preorderProduct(10);
        await reserveForOrder(anOrderId(), [claim(productId, 2)]);

        await receive(productId, 5);

        expect(await announced()).toEqual([]);
        expect(await levelOf(productId)).toMatchObject({ onHand: 5, reserved: 0, preordered: 2 });
    });

    it('is a plain receipt when nothing is waiting', async () => {
        const product = await createProduct({ onHand: 1 });

        await receive(String(product._id), 4);

        expect(await announced()).toEqual([]);
        expect(await levelOf(String(product._id))).toMatchObject({ onHand: 5, reserved: 0 });
    });

    it('lets the allocated units ship like any other, and only those', async () => {
        const productId = await preorderProduct(10);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 3)]);
        await commitForOrder(orderId);
        await receive(productId, 2);

        await withTransaction((session) =>
            shipLinesForOrder(orderId, [{ productId, quantity: 2 }], session)
        );

        expect(await levelOf(productId)).toMatchObject({ onHand: 0, reserved: 0, preordered: 1 });
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.items).toMatchObject([{ quantity: 1, kind: 'preorder' }]);
        expect(hold?.status).toBe('committed');
    });
});

describe('what a shopper may buy', () => {
    it('reads the allowance, not the shelf, for a product named as a preorder', async () => {
        const product = await createProduct({ onHand: 50 });
        const productId = String(product._id);
        await setPreorderLimit(productId, 4);
        await reserveForOrder(anOrderId(), [claim(productId, 1)]);

        const sellable = await availableFor([productId], new Set([productId]));
        const onTheShelf = await availableFor([productId]);

        expect(sellable.get(productId)).toBe(3);
        expect(onTheShelf.get(productId)).toBe(50);
    });
});

describe('the preorder board', () => {
    it('splits outstanding units between paid and unpaid orders, and counts the lifetime orders', async () => {
        const productId = await preorderProduct(10);
        const paid = anOrderId();
        await reserveForOrder(paid, [claim(productId, 2)]);
        await commitForOrder(paid);
        await reserveForOrder(anOrderId(), [claim(productId, 3)]);

        const { items, meta } = await listPreorders();

        expect(meta.totalItems).toBe(1);
        expect(items).toMatchObject([
            {
                productId,
                preorderLimit: 10,
                preordered: 5,
                held: 3,
                paid: 2,
                left: 5,
                ordered: 5
            }
        ]);
    });

    it('lists a product with an allowance and nothing outstanding, and leaves out the rest', async () => {
        const productId = await preorderProduct(4);
        await createProduct({ onHand: 9 });

        const { items } = await listPreorders();

        expect(items).toMatchObject([{ productId, preordered: 0, left: 4, held: 0, paid: 0 }]);
    });
});

describe('setPreorderLimit', () => {
    it('answers 404 for an unknown product and writes nothing', async () => {
        const result = await setPreorderLimit('f'.repeat(24), 3);

        expect(result).toMatchObject({ success: false, status: 404 });
    });

    it('lets the limit drop below what is outstanding: those orders stand, new ones are refused', async () => {
        const productId = await preorderProduct(5);
        const orderId = anOrderId();
        await reserveForOrder(orderId, [claim(productId, 4)]);

        await setPreorderLimit(productId, 1);

        expect(await levelOf(productId)).toMatchObject({ preordered: 4, preorderLimit: 1 });
        expect(await reserveForOrder(anOrderId(), [claim(productId, 1)])).toMatchObject({
            held: false
        });
    });
});

describe('the low-stock gauge', () => {
    it('does not count a preorder product waiting for stock', async () => {
        await createProduct({
            onHand: 0,
            releaseDate: new Date(Date.now() + 86_400_000).toISOString()
        });
        await createProduct({ onHand: 0 });

        expect(await lowStockCount()).toBe(1);
    });
});
