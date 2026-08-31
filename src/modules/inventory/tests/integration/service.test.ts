/**
 * @module
 * Inventory service tests. The lifecycle across modules is covered by
 * `cart/tests/unit/stock.test.ts`, and the replay invariant by `ledger.property.test.ts`, so
 * what's left here is the module's own edges: the exactly-once claims, the two admin transitions
 * and their refusals, and the sweep. Real Mongo throughout, since every guarantee is a
 * conditional write.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { createProduct } from '@modules/products/tests/fixtures';
import { productRepository } from '@modules/products';
import { StockMovementReason } from '@types';
import {
    reserveForOrder,
    commitForOrder,
    releaseForOrder,
    runReservationSweep,
    receive,
    adjust,
    listLevels,
    listMovements
} from '../../service';
import { reservationRepository } from '../../repository';
import { reservationModel } from '../../model';

setupTestDb();

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'b');

const countersOf = async (productId: string) => {
    const stored = await productRepository.findByIdRaw(productId);
    return { onHand: stored?.onHand, reserved: stored?.reserved };
};

/**
 * Run `body` with the reservation window closed, so every hold it opens is already stale.
 * Defined at module scope, not inside a describe, because leaving the TTL at zero for the whole
 * file would expire the holds every other case here depends on.
 */
const withoutWindow = (body: () => Promise<void>) =>
    withEnvironment('NODE_RESERVATION_TTL_MINUTES', '0', body);

describe('reserveForOrder', () => {
    it('holds every line or none of them', async () => {
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });

        const outcome = await reserveForOrder(anOrderId(), [
            { productId: String(plenty._id), quantity: 2 },
            { productId: String(scarce._id), quantity: 5 }
        ]);

        expect(outcome).toEqual({
            held: false,
            shortfalls: [
                {
                    productId: String(scarce._id),
                    title: 'Scarce',
                    requested: 5,
                    available: 1
                }
            ]
        });
        expect(await countersOf(String(plenty._id))).toEqual({ onHand: 50, reserved: 0 });
        expect(await countersOf(String(scarce._id))).toEqual({ onHand: 1, reserved: 0 });
    });

    it('records the rollback rather than netting it to nothing', async () => {
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });

        await reserveForOrder(anOrderId(), [
            { productId: String(plenty._id), quantity: 2 },
            { productId: String(scarce._id), quantity: 5 }
        ]);

        // A reserve and its undo, both on the row — hiding the reversal would make the ledger
        // unreconcilable: "nothing happened" and "two things cancelled out" are different facts,
        // and only the second explains a gap in a stock take.
        const rows = await listMovements({ productId: String(plenty._id) });
        expect(rows.data?.items.map((row) => row.reason)).toEqual([
            StockMovementReason.release,
            StockMovementReason.reserve
        ]);
    });

    it('is idempotent on the order id — a retried checkout holds once', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        const lines = [{ productId: String(product._id), quantity: 3 }];

        expect(await reserveForOrder(orderId, lines)).toEqual({ held: true });
        expect(await reserveForOrder(orderId, lines)).toEqual({ held: true });

        // Three, not six: the unique `orderId` is what makes the second call a no-op.
        expect(await countersOf(String(product._id))).toEqual({ onHand: 10, reserved: 3 });
    });

    /*
     * Surfaced by mutation testing: replacing the duplicate-key check in `insertHold` with `true`
     * survived every test. Swallowing any error into `null` makes `reserveForOrder` read it as
     * "already held", so a database failure would report a hold while holding nothing and the
     * order behind it would ship with no stock. Only 11000 may become `null` — everything else
     * must propagate.
     */
    it('propagates a non-duplicate database error instead of reporting a hold', async () => {
        const product = await createProduct({ onHand: 10 });
        const failure = Object.assign(new Error('connection reset'), { code: 121 });
        const spy = jest.spyOn(reservationModel, 'create').mockRejectedValue(failure);

        await expect(
            reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 3 }])
        ).rejects.toThrow('connection reset');

        // And nothing was held on the way out.
        expect(await countersOf(String(product._id))).toEqual({ onHand: 10, reserved: 0 });
        spy.mockRestore();
    });

    it('refuses when the units exist but are all held', async () => {
        const product = await createProduct({ onHand: 4 });
        await reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 4 }]);

        const outcome = await reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 1 }
        ]);

        // Four units exist and none is for sale — the shortfall reports availability, not onHand.
        expect(outcome).toEqual({
            held: false,
            shortfalls: [
                {
                    productId: String(product._id),
                    title: expect.any(String),
                    requested: 1,
                    available: 0
                }
            ]
        });
        expect(await countersOf(String(product._id))).toEqual({ onHand: 4, reserved: 4 });
    });
});

describe('commitForOrder', () => {
    it('drops both counters together', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await reserveForOrder(orderId, [{ productId: String(product._id), quantity: 3 }]);

        expect(await commitForOrder(orderId)).toBe(true);
        expect(await countersOf(String(product._id))).toEqual({ onHand: 7, reserved: 0 });
    });

    it('is at most once — a second confirm commits nothing', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await reserveForOrder(orderId, [{ productId: String(product._id), quantity: 3 }]);

        await commitForOrder(orderId);
        expect(await commitForOrder(orderId)).toBe(false);

        // Seven, not four: the reservation's status claim is what refuses the replay.
        expect(await countersOf(String(product._id))).toEqual({ onHand: 7, reserved: 0 });
    });

    it('cannot commit a hold that was already released', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await reserveForOrder(orderId, [{ productId: String(product._id), quantity: 3 }]);
        await releaseForOrder(orderId);

        expect(await commitForOrder(orderId)).toBe(false);
        expect(await countersOf(String(product._id))).toEqual({ onHand: 10, reserved: 0 });
    });

    it('does nothing for an order that never held anything', async () => {
        expect(await commitForOrder(anOrderId())).toBe(false);
    });
});

describe('releaseForOrder', () => {
    it('gives the units back and is at most once', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await reserveForOrder(orderId, [{ productId: String(product._id), quantity: 4 }]);

        expect(await releaseForOrder(orderId)).toBe(true);
        expect(await releaseForOrder(orderId)).toBe(false);
        expect(await countersOf(String(product._id))).toEqual({ onHand: 10, reserved: 0 });
    });

    it('records which story it was', async () => {
        const product = await createProduct({ onHand: 10 });
        const cancelled = anOrderId();
        const abandoned = anOrderId();
        await reserveForOrder(cancelled, [{ productId: String(product._id), quantity: 1 }]);
        await releaseForOrder(cancelled);
        await reserveForOrder(abandoned, [{ productId: String(product._id), quantity: 1 }]);
        await releaseForOrder(abandoned, StockMovementReason.expire);

        // Same arithmetic, different reasons — "changed their mind" and "never came back" are
        // different facts about the shop, and only one of them is a conversion problem.
        const ledger = await listMovements({ productId: String(product._id) });
        const reasons = ledger.data?.items.map((row) => row.reason);
        expect(reasons).toContain(StockMovementReason.release);
        expect(reasons).toContain(StockMovementReason.expire);
    });
});

describe('receive', () => {
    it('raises what exists and makes it available immediately', async () => {
        const product = await createProduct({ onHand: 0 });

        const result = await receive(String(product._id), 12, 'pallet 42');

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ onHand: 12, reserved: 0, available: 12 });
    });

    it('does not disturb an existing hold', async () => {
        const product = await createProduct({ onHand: 5 });
        await reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 5 }]);

        const result = await receive(String(product._id), 10);

        // The hold is untouched; the delivery is what becomes sellable.
        expect(result.data).toMatchObject({ onHand: 15, reserved: 5, available: 10 });
    });

    it('404s for a product that does not exist', async () => {
        const result = await receive('c'.repeat(24), 5);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('adjust', () => {
    it('applies a correction in either direction', async () => {
        const product = await createProduct({ onHand: 10 });

        const down = await adjust(String(product._id), -3, 'damaged');
        expect(down.data).toMatchObject({ onHand: 7 });

        const up = await adjust(String(product._id), 2, 'miscount');
        expect(up.data).toMatchObject({ onHand: 9 });
    });

    it('refuses a correction that would go below what is already promised', async () => {
        const product = await createProduct({ onHand: 10 });
        await reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 8 }]);

        const result = await adjust(String(product._id), -5, 'stocktake');

        /*
         * Eight units are promised to an order that exists. Letting this through would make
         * availability negative and oversell everyone behind it; the fix is to cancel orders,
         * which releases holds and makes room for the correction.
         */
        expect(result.success).toBe(false);
        expect(result.status).toBe(409);
        expect(!result.success && result.errors[0]).toMatchObject({
            code: 'INVENTORY_BELOW_RESERVED'
        });
        expect(await countersOf(String(product._id))).toEqual({ onHand: 10, reserved: 8 });
    });

    it('allows a correction down to exactly what is promised', async () => {
        const product = await createProduct({ onHand: 10 });
        await reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 8 }]);

        const result = await adjust(String(product._id), -2, 'stocktake');

        // The boundary is inclusive: onHand may equal reserved, it may not fall below it.
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ onHand: 8, reserved: 8, available: 0 });
    });

    it('404s for a product that does not exist', async () => {
        const result = await adjust('c'.repeat(24), -1);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('404s rather than 409s for a product deleted mid-request', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);

        /*
         * The write's guard covers both "the product exists" and "the correction fits", so a
         * vanished product and a blocked correction look identical to it. Deleting between the
         * pre-check and the write is the only way to reach that ambiguity — the wrong answer
         * would waste an operator's time chasing a stock conflict that doesn't exist.
         */
        const blocked = productRepository.adjustUnits;
        const spy = jest
            .spyOn(productRepository, 'adjustUnits')
            .mockImplementation(async (id, delta) => {
                // Through the barrel, like any cross-module reach — `eslint-plugin-boundaries`
                // fails a spec that touches a sibling's model directly, and it is right to.
                const doomed = await productRepository.findById(id);
                if (doomed) await productRepository.deleteOne(doomed);
                return blocked(id, delta);
            });

        const result = await adjust(productId, -1, 'stocktake');

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        spy.mockRestore();
    });
});

describe('runReservationSweep', () => {
    it('releases stale holds and leaves fresh ones alone', async () => {
        const product = await createProduct({ onHand: 20 });
        const fresh = anOrderId();
        await reserveForOrder(fresh, [{ productId: String(product._id), quantity: 5 }]);

        let stale = '';
        await withoutWindow(async () => {
            stale = anOrderId();
            await reserveForOrder(stale, [{ productId: String(product._id), quantity: 5 }]);
        });

        const expired = await runReservationSweep();

        expect(expired).toBe(1);
        // The fresh hold survives — a sweep is a deadline, not a purge.
        expect(await countersOf(String(product._id))).toEqual({ onHand: 20, reserved: 5 });
        const freshHold = await reservationRepository.findByOrderId(fresh);
        const staleHold = await reservationRepository.findByOrderId(stale);
        expect(freshHold?.status).toBe('held');
        expect(staleHold?.status).toBe('released');
    });

    it('is idempotent', async () =>
        withoutWindow(async () => {
            const product = await createProduct({ onHand: 20 });
            await reserveForOrder(anOrderId(), [{ productId: String(product._id), quantity: 5 }]);

            expect(await runReservationSweep()).toBe(1);
            expect(await runReservationSweep()).toBe(0);
            expect(await countersOf(String(product._id))).toEqual({ onHand: 20, reserved: 0 });
        }));
});

describe('listLevels', () => {
    it('reports both counters and the availability they imply, scarcest first', async () => {
        await createProduct({ title: 'Empty', onHand: 0 });
        await createProduct({ title: 'Plenty', onHand: 100 });
        const allHeld = await createProduct({ title: 'All held', onHand: 30 });
        await reserveForOrder(anOrderId(), [{ productId: String(allHeld._id), quantity: 30 }]);

        const result = await listLevels();

        // The two zero-availability rows sort ahead of the plentiful one, and they are
        // distinguishable — which is the whole reason the board shows three numbers.
        expect(result.data?.items.map((level) => level.title)).toEqual([
            'All held',
            'Empty',
            'Plenty'
        ]);
        expect(result.data?.items).toEqual([
            expect.objectContaining({ onHand: 30, reserved: 30, available: 0 }),
            expect.objectContaining({ onHand: 0, reserved: 0, available: 0 }),
            expect.objectContaining({ onHand: 100, reserved: 0, available: 100 })
        ]);
        expect(result.data?.meta).toMatchObject({ totalItems: 3, totalPages: 1 });
    });

    it('narrows to what needs ordering when asked', async () => {
        process.env.NODE_LOW_STOCK_THRESHOLD = '5';
        await createProduct({ title: 'Low', onHand: 2 });
        await createProduct({ title: 'Fine', onHand: 500 });

        const result = await listLevels({ lowOnly: true });

        expect(result.data?.items.map((level) => level.title)).toEqual(['Low']);
        // The total follows the filter, not the collection — otherwise the board would report
        // two pages of scarce products and render one row.
        expect(result.data?.meta.totalItems).toBe(1);
        delete process.env.NODE_LOW_STOCK_THRESHOLD;
    });

    it('pages rather than reading the whole catalogue', async () => {
        for (let index = 0; index < 5; index += 1)
            await createProduct({ title: `P${index}`, onHand: index });

        const result = await listLevels({ page: 2, pageSize: 2 });

        expect(result.data?.items.map((level) => level.available)).toEqual([2, 3]);
        expect(result.data?.meta).toMatchObject({
            page: 2,
            pageSize: 2,
            totalItems: 5,
            totalPages: 3
        });
    });
});
