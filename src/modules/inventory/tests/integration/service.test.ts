/**
 * @module
 * Inventory service tests. The lifecycle across modules is covered by
 * `cart/tests/integration/stock.test.ts`, and the replay invariant by `ledger.property.test.ts`, so
 * what's left here is the module's own edges: the exactly-once claims, the two admin transitions
 * and their refusals, and the sweep. Real Mongo throughout, since every guarantee is a
 * conditional write.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { setEnvironment, withEnvironmentOverrides } from '@tests/environment';
import { observePort } from '@tests/ports';
import {
    createProduct,
    readProduct,
    deleteProduct,
    countersOf
} from '@modules/products/tests/factories';
import { StockMovementReason } from '@types';
import { inventoryService } from '../../services';
import { reservationRepository, stockLevelRepository } from '../../repository';
import { reservationModel, stockLevelModel } from '../../model';
import { inventoryAuditActions } from '../../audit';
import * as auditPort from '@infrastructure/observability/audit';
import { withTransaction } from '@infrastructure/runtime/database';
import { testCallerContext } from '@tests/callers';

/*
 * The audit port is REPLACED, not spied on: `jest.spyOn` cannot redefine the non-configurable
 * getter a CommonJS namespace import exposes. See `tests/support/ports.ts` for the full reasoning.
 */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** A syntactically valid order id, distinct per call — holds are keyed by one. */
let orderCounter = 0;
const anOrderId = () => (++orderCounter).toString(16).padStart(24, 'b');

/** The status of an order's hold, or `undefined` when it has none. */
const holdStatusOf = (orderId: string) =>
    reservationRepository.findByOrderId(orderId).then((hold) => hold?.status);

/** `stocklevels` itself — this module's source of truth, `countersOf` above only reads the mirror `syncStockCache` writes into `products`. */
const levelOf = async (productId: string) => {
    const level = await stockLevelRepository.findByProductId(productId);
    return { onHand: level?.onHand, reserved: level?.reserved };
};

/**
 * Run `body` with the reservation window closed, so every hold it opens is already stale.
 * Defined at module scope, not inside a describe, because leaving the TTL at zero for the whole
 * file would expire the holds every other case here depends on.
 */
const withoutWindow = (body: () => Promise<void>) =>
    withEnvironmentOverrides({ NODE_RESERVATION_TTL_MINUTES: '0' }, body);

describe('reserveForOrder', () => {
    it('holds every line or none of them', async () => {
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
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
        expect(await countersOf(String(plenty._id))).toEqual({
            onHand: 50,
            reserved: 0,
            available: 50
        });
        expect(await countersOf(String(scarce._id))).toEqual({
            onHand: 1,
            reserved: 0,
            available: 1
        });
    });

    it('records the rollback rather than netting it to nothing', async () => {
        const plenty = await createProduct({ title: 'Plenty', onHand: 50 });
        const scarce = await createProduct({ title: 'Scarce', onHand: 1 });

        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(plenty._id), quantity: 2 },
            { productId: String(scarce._id), quantity: 5 }
        ]);

        // A reserve and its undo, both on the row — hiding the reversal would make the ledger
        // unreconcilable: "nothing happened" and "two things cancelled out" are different facts,
        // and only the second explains a gap in a stock take.
        const rows = await inventoryService.listMovements({ productId: String(plenty._id) });
        expect(rows.items.map((row) => row.reason)).toEqual([
            StockMovementReason.release,
            StockMovementReason.reserve
        ]);
    });

    it('is idempotent on the order id — a retried checkout holds once, reporting the same expiry', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        const lines = [{ productId: String(product._id), quantity: 3 }];

        const first = await inventoryService.reserveForOrder(orderId, lines);
        const second = await inventoryService.reserveForOrder(orderId, lines);

        expect(first).toEqual({ held: true, expiresAt: expect.any(Date), owed: [] });
        // The retry reports the FIRST call's own expiry, never a fresh guess it never wrote.
        expect(second).toEqual(first);

        // Three, not six: the unique `orderId` is what makes the second call a no-op.
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 3,
            available: 7
        });
        // The cache agreeing with itself twice isn't proof `syncStockCache` mirrored the real
        // write — `stocklevels` is the row every other assertion in this file takes on faith.
        expect(await levelOf(String(product._id))).toEqual({ onHand: 10, reserved: 3 });
    });

    it('holds for the caller-given window instead of NODE_RESERVATION_TTL_MINUTES, when given one', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        const before = Date.now();

        await inventoryService.reserveForOrder(
            orderId,
            [{ productId: String(product._id), quantity: 1 }],
            60 * 24 * 7
        );

        const hold = await reservationRepository.findByOrderId(orderId);
        // A week, not the default 30 minutes — the whole point of a caller-given window.
        const expected = before + 7 * 24 * 60 * 60_000;
        expect(hold!.expiresAt.getTime()).toBeGreaterThanOrEqual(expected - 5000);
        expect(hold!.expiresAt.getTime()).toBeLessThanOrEqual(expected + 5000);
    });

    it('falls back to NODE_RESERVATION_TTL_MINUTES when no window is given', () =>
        withEnvironmentOverrides({ NODE_RESERVATION_TTL_MINUTES: '45' }, async () => {
            const product = await createProduct({ onHand: 10 });
            const orderId = anOrderId();
            const before = Date.now();

            await inventoryService.reserveForOrder(orderId, [
                { productId: String(product._id), quantity: 1 }
            ]);

            const hold = await reservationRepository.findByOrderId(orderId);
            const expected = before + 45 * 60_000;
            expect(hold!.expiresAt.getTime()).toBeGreaterThanOrEqual(expected - 5000);
            expect(hold!.expiresAt.getTime()).toBeLessThanOrEqual(expected + 5000);
        }));

    // An unpaid hold takes stock from every other buyer, so the shipped window is short.
    it('holds a card checkout for 15 minutes when nothing configures it', () =>
        withEnvironmentOverrides({ NODE_RESERVATION_TTL_MINUTES: undefined }, async () => {
            const product = await createProduct({ onHand: 10 });
            const orderId = anOrderId();
            const before = Date.now();

            await inventoryService.reserveForOrder(orderId, [
                { productId: String(product._id), quantity: 1 }
            ]);

            const hold = await reservationRepository.findByOrderId(orderId);
            const expected = before + 15 * 60_000;
            expect(hold!.expiresAt.getTime()).toBeGreaterThanOrEqual(expected - 5000);
            expect(hold!.expiresAt.getTime()).toBeLessThanOrEqual(expected + 5000);
        }));

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
            inventoryService.reserveForOrder(anOrderId(), [
                { productId: String(product._id), quantity: 3 }
            ])
        ).rejects.toThrow('connection reset');

        // And nothing was held on the way out.
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
        spy.mockRestore();
    });

    // The stock write has committed by the time the catalogue's cache is refreshed: a failed read of
    // the level there must not throw, or the units stay reserved against a hold nobody gave back.
    it('still holds the units when the cache refresh cannot read the level afterwards', async () => {
        const realFind = stockLevelRepository.findByProductId;
        // Count the level reads one reserve makes; the LAST of them is the cache refresh's.
        const probe = await createProduct({ onHand: 10 });
        let reads = 0;
        const counting = jest
            .spyOn(stockLevelRepository, 'findByProductId')
            .mockImplementation((productId) => {
                reads += 1;
                return realFind(productId);
            });
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(probe._id), quantity: 1 }
        ]);
        const lastRead = reads;
        counting.mockRestore();

        const product = await createProduct({ onHand: 10 });
        let call = 0;
        jest.spyOn(stockLevelRepository, 'findByProductId').mockImplementation((productId) => {
            call += 1;
            return call === lastRead
                ? Promise.reject(new Error('read failed'))
                : realFind(productId);
        });
        const orderId = anOrderId();
        const outcome = await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        jest.restoreAllMocks();

        expect(outcome.held).toBe(true);
        // The ledger's own level is the source of truth; the catalogue's copy catches up on the
        // product's next stock change.
        const level = await stockLevelRepository.findByProductId(String(product._id));
        expect([level?.onHand, level?.reserved]).toEqual([10, 3]);
        expect(await reservationRepository.findByOrderId(orderId)).not.toBeNull();
    });

    /*
     * A throw mid-loop (not a refusal) must not leave the hold naming a line whose counters
     * never moved: a later release would read that line's quantity off the hold and subtract it
     * from whatever the counter actually held — here, another order's own reservation.
     */
    it('gives back only what it actually took when a later line throws, and steals nothing from another hold', async () => {
        const productA = await createProduct({ title: 'A', onHand: 10 });
        const productB = await createProduct({ title: 'B', onHand: 10 });
        const otherOrderId = anOrderId();
        await inventoryService.reserveForOrder(otherOrderId, [
            { productId: String(productB._id), quantity: 4 }
        ]);

        const realApplyDelta = stockLevelRepository.applyDelta;
        let calls = 0;
        const spy = jest
            .spyOn(stockLevelRepository, 'applyDelta')
            .mockImplementation((productId, reason, quantity, delta) => {
                calls += 1;
                // The 1st call after this spy is installed is A's own line, which must succeed so
                // there is something to roll back; the 2nd is B's, made to throw like a database
                // hiccup rather than a refusal.
                return calls === 2
                    ? Promise.reject(new Error('connection reset'))
                    : realApplyDelta(productId, reason, quantity, delta);
            });

        const orderId = anOrderId();
        await expect(
            inventoryService.reserveForOrder(orderId, [
                { productId: String(productA._id), quantity: 2 },
                { productId: String(productB._id), quantity: 3 }
            ])
        ).rejects.toThrow('connection reset');
        spy.mockRestore();

        // The other order's hold on B is untouched — the bug this guards against subtracted 3
        // from it (dropping it to 1) because the failed hold still named a line it never took.
        expect(await countersOf(String(productB._id))).toEqual({
            onHand: 10,
            reserved: 4,
            available: 6
        });
        expect(await countersOf(String(productA._id))).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
        expect(await reservationRepository.findByOrderId(orderId)).toBeNull();
    });

    it('refuses when the units exist but are all held', async () => {
        const product = await createProduct({ onHand: 4 });
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 4 }
        ]);

        const outcome = await inventoryService.reserveForOrder(anOrderId(), [
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
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 4,
            reserved: 4,
            available: 0
        });
    });
});

describe('commitForOrder', () => {
    it('moves no counter', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);

        expect(await inventoryService.commitForOrder(orderId)).toBe(true);
        // Paying moves nothing: the units are still on the shelf, still spoken for. Read from
        // `stocklevels`, the source of truth: the catalogue's copy is refreshed only when units
        // were allocated, so it would keep reading the old numbers even if the commit moved them.
        expect(await levelOf(String(product._id))).toEqual({ onHand: 10, reserved: 3 });
    });

    it('still answers true when the hold cannot be read for the cache refresh afterwards', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        const realFind = reservationRepository.findByOrderId;
        let reads = 0;
        const spy = jest.spyOn(reservationRepository, 'findByOrderId').mockImplementation((id) => {
            reads += 1;
            // The commit's own claim reads the hold; the refresh that follows is the read that fails.
            return reads === 1 ? realFind(id) : Promise.reject(new Error('read failed'));
        });

        const committed = await inventoryService.commitForOrder(orderId);
        spy.mockRestore();

        expect(committed).toBe(true);
    });

    it('writes no ledger row — nothing moved, and the date lives on the hold', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.commitForOrder(orderId);

        const ledger = await inventoryService.listMovements({ productId: String(product._id) });
        expect(ledger.items.map(({ reason }) => reason)).toEqual([StockMovementReason.reserve]);
    });

    it('is at most once — a second confirm commits nothing, and raises no alarm', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);

        await inventoryService.commitForOrder(orderId);
        auditSpy.mockClear();
        expect(await inventoryService.commitForOrder(orderId)).toBe(false);

        // Still one claim, not two: the reservation's status claim is what refuses the replay.
        expect(await levelOf(String(product._id))).toEqual({ onHand: 10, reserved: 3 });
        // A redelivered settlement finding its own sale already on record is not an incident.
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it("takes a released hold's units again and commits them, when the shelf still has them", async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.releaseForOrder(orderId);

        expect(await inventoryService.commitForOrder(orderId)).toBe(true);

        // Set aside again for the order that paid, not given to anyone meanwhile.
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 3,
            available: 7
        });
        expect(await holdStatusOf(orderId)).toBe('committed');
        // Money landing on a released hold that can be kept is not an incident.
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('cannot commit a released hold whose units were sold meanwhile, and alarms it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 4 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.releaseForOrder(orderId);
        // A stranger takes what the released hold gave back.
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 3 }
        ]);

        expect(await inventoryService.commitForOrder(orderId)).toBe(false);

        // Nothing is half-taken: the stranger's units stand, the late hold is released again.
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 4,
            reserved: 3,
            available: 1
        });
        expect(await holdStatusOf(orderId)).toBe('released');
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: inventoryAuditActions.ADMIN_COMMIT_ORPHANED,
                outcome: 'failure',
                // SYSTEM_ACTOR's own role now, not admin's.
                actorRole: 'system',
                actorUserId: 'system',
                targetType: 'order',
                targetId: orderId,
                metadata: { reservationStatus: 'released', stage: 'commit' }
            })
        );
    });

    it('gives back the lines it took when a later line of a released hold is short', async () => {
        const first = await createProduct({ onHand: 5 });
        const second = await createProduct({ onHand: 2 });
        const orderId = anOrderId();
        const lines = [
            { productId: String(first._id), quantity: 2 },
            { productId: String(second._id), quantity: 2 }
        ];
        await inventoryService.reserveForOrder(orderId, lines);
        await inventoryService.releaseForOrder(orderId);
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(second._id), quantity: 2 }
        ]);

        const outcome = await withTransaction((session) =>
            inventoryService.retakeReleasedForOrder(orderId, session)
        );

        expect(outcome).toBe('short');
        // The first line was taken and given back inside the transaction: no unit stays held.
        expect(await countersOf(String(first._id))).toMatchObject({ onHand: 5, reserved: 0 });
        expect(await countersOf(String(second._id))).toMatchObject({ onHand: 2, reserved: 2 });
        expect(await holdStatusOf(orderId)).toBe('released');
    });

    it('lets exactly one of two late payments racing for the last unit take it', async () => {
        const product = await createProduct({ onHand: 1 });
        const first = anOrderId();
        const second = anOrderId();
        for (const orderId of [first, second]) {
            await reservationRepository.insertHold(
                orderId,
                [{ productId: String(product._id), quantity: 1 }],
                new Date()
            );
            await reservationRepository.claimStatus(orderId, 'held', 'released');
        }

        const outcomes = await Promise.all(
            [first, second].map((orderId) =>
                withTransaction((session) =>
                    inventoryService.retakeReleasedForOrder(orderId, session)
                )
            )
        );

        expect(outcomes.toSorted()).toEqual(['retaken', 'short']);
        expect(await levelOf(String(product._id))).toEqual({ onHand: 1, reserved: 1 });
    });

    it('reports nothing to take for a hold that is not released', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);

        const outcome = await withTransaction((session) =>
            inventoryService.retakeReleasedForOrder(orderId, session)
        );

        expect(outcome).toBe('none');
        expect(await countersOf(String(product._id))).toMatchObject({ onHand: 10, reserved: 3 });
    });

    it('does nothing for an order that never held anything, and alarms it', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();

        expect(await inventoryService.commitForOrder(orderId)).toBe(false);

        // No hold ever existed, so no counter had anything to move.
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: inventoryAuditActions.ADMIN_COMMIT_ORPHANED,
                outcome: 'failure',
                targetId: orderId,
                metadata: { reservationStatus: 'none', stage: 'commit' }
            })
        );
    });
});

/** Three units of one product, held and committed — the hold a paid order has. */
const committedHold = async () => {
    const product = await createProduct({ onHand: 10 });
    const productId = String(product._id);
    const orderId = anOrderId();
    await inventoryService.reserveForOrder(orderId, [{ productId, quantity: 3 }]);
    await inventoryService.commitForOrder(orderId);
    return { productId, orderId };
};

describe('shipLinesForOrder and releaseLinesForOrder', () => {
    it('ships some units: onHand and reserved drop together, and the hold keeps the rest', async () => {
        const { productId, orderId } = await committedHold();

        const shipped = await withTransaction((session) =>
            inventoryService.shipLinesForOrder(orderId, [{ productId, quantity: 1 }], session)
        );
        await inventoryService.refreshStockCacheForProducts([productId]);

        expect(shipped).toBe(true);
        expect(await countersOf(productId)).toEqual({ onHand: 9, reserved: 2, available: 7 });
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold).toMatchObject({ status: 'committed' });
        expect(hold?.items.map(({ quantity }) => quantity)).toEqual([2]);
    });

    it('ends the hold shipped with its last unit, and a later whole-hold ship has nothing to take', async () => {
        const { productId, orderId } = await committedHold();

        await withTransaction((session) =>
            inventoryService.shipLinesForOrder(orderId, [{ productId, quantity: 3 }], session)
        );

        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.status).toBe('shipped');
        expect(await inventoryService.shipForOrder(orderId)).toBe(false);
    });

    it('takes no more than the hold holds of a product', async () => {
        const { productId, orderId } = await committedHold();

        await withTransaction((session) =>
            inventoryService.shipLinesForOrder(orderId, [{ productId, quantity: 9 }], session)
        );

        expect(await levelOf(productId)).toEqual({ onHand: 7, reserved: 0 });
    });

    it('gives some units back: reserved drops, the units stay on the shelf and sellable', async () => {
        const { productId, orderId } = await committedHold();

        const released = await withTransaction((session) =>
            inventoryService.releaseLinesForOrder(orderId, [{ productId, quantity: 2 }], session)
        );
        await inventoryService.refreshStockCacheForProducts([productId]);

        expect(released).toBe(true);
        expect(await countersOf(productId)).toEqual({ onHand: 10, reserved: 1, available: 9 });
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.status).toBe('committed');
    });

    it('ends the hold released when the last units are given back', async () => {
        const { productId, orderId } = await committedHold();

        await withTransaction((session) =>
            inventoryService.releaseLinesForOrder(orderId, [{ productId, quantity: 3 }], session)
        );

        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.status).toBe('released');
    });

    it('moves nothing, in either direction, when the caller’s transaction rolls back', async () => {
        const { productId, orderId } = await committedHold();

        await expect(
            withTransaction((session) =>
                inventoryService
                    .shipLinesForOrder(orderId, [{ productId, quantity: 1 }], session)
                    .then(() => {
                        throw new Error('the act failed later');
                    })
            )
        ).rejects.toThrow('the act failed later');

        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 3 });
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.items[0].quantity).toBe(3);
    });

    it('raises the alarm for a ship with no hold behind it, and answers false', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });

        const shipped = await withTransaction((session) =>
            inventoryService.shipLinesForOrder(
                anOrderId(),
                [{ productId: String(product._id), quantity: 1 }],
                session
            )
        );

        expect(shipped).toBe(false);
        expect(auditSpy).toHaveBeenCalled();
    });

    it('answers false for a release with no open hold, silently', async () => {
        const { productId, orderId } = await committedHold();
        await inventoryService.shipForOrder(orderId);

        const released = await withTransaction((session) =>
            inventoryService.releaseLinesForOrder(orderId, [{ productId, quantity: 1 }], session)
        );

        expect(released).toBe(false);
    });
});

describe('shipForOrder', () => {
    it('takes the units off the shelf and leaves availability alone', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.commitForOrder(orderId);

        expect(await inventoryService.shipForOrder(orderId)).toBe(true);

        expect(await countersOf(String(product._id))).toEqual({
            onHand: 7,
            reserved: 0,
            available: 7
        });
        const ledger = await inventoryService.listMovements({
            productId: String(product._id),
            reason: StockMovementReason.ship
        });
        expect(ledger.items[0]).toMatchObject({ onHandDelta: -3, reservedDelta: -3 });
    });

    it('is at most once, and a replay raises no alarm', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.commitForOrder(orderId);
        await inventoryService.shipForOrder(orderId);
        auditSpy.mockClear();

        expect(await inventoryService.shipForOrder(orderId)).toBe(false);

        expect(await countersOf(String(product._id))).toMatchObject({ onHand: 7, reserved: 0 });
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('still ships a hold whose payment commit never landed', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);

        expect(await inventoryService.shipForOrder(orderId)).toBe(true);

        expect(await countersOf(String(product._id))).toMatchObject({ onHand: 7, reserved: 0 });
        // The payment's own retry then finds a shipped hold: a replay, not an incident.
        expect(await inventoryService.commitForOrder(orderId)).toBe(false);
    });

    it('alarms a shipment with no hold, and moves nothing', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();

        expect(await inventoryService.shipForOrder(orderId)).toBe(false);

        expect(await countersOf(String(product._id))).toMatchObject({ onHand: 10, reserved: 0 });
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: inventoryAuditActions.ADMIN_COMMIT_ORPHANED,
                outcome: 'failure',
                targetId: orderId,
                metadata: { reservationStatus: 'none', stage: 'ship' }
            })
        );
    });

    it('stays silent for a shipment whose hold a remainder cancel already emptied', async () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.commitForOrder(orderId);
        auditSpy.mockClear();
        // One unit shipped in a partial shipment, the other two cancelled as the remainder.
        await withTransaction(async (session) => {
            await inventoryService.shipLinesForOrder(
                orderId,
                [{ productId: String(product._id), quantity: 1 }],
                session
            );
            await inventoryService.releaseLinesForOrder(
                orderId,
                [{ productId: String(product._id), quantity: 2 }],
                session
            );
        });

        // The order is then forced shipped→delivered: nothing is left to take, and that is benign.
        expect(await inventoryService.shipForOrder(orderId)).toBe(false);

        expect(await levelOf(String(product._id))).toEqual({ onHand: 9, reserved: 0 });
        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('releaseCommittedForOrder', () => {
    it('gives a paid, unshipped claim back without touching the shelf', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 4 }
        ]);
        await inventoryService.commitForOrder(orderId);

        expect(await inventoryService.releaseCommittedForOrder(orderId)).toBe(true);
        expect(await inventoryService.releaseCommittedForOrder(orderId)).toBe(false);

        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
        const ledger = await inventoryService.listMovements({
            productId: String(product._id),
            reason: StockMovementReason.release
        });
        expect(ledger.items).toHaveLength(1);
    });

    it('leaves an unpaid hold to releaseForOrder, and a shipped one alone', async () => {
        const product = await createProduct({ onHand: 10 });
        const unpaid = anOrderId();
        const shipped = anOrderId();
        await inventoryService.reserveForOrder(unpaid, [
            { productId: String(product._id), quantity: 1 }
        ]);
        await inventoryService.reserveForOrder(shipped, [
            { productId: String(product._id), quantity: 1 }
        ]);
        await inventoryService.commitForOrder(shipped);
        await inventoryService.shipForOrder(shipped);

        expect(await inventoryService.releaseCommittedForOrder(unpaid)).toBe(false);
        expect(await inventoryService.releaseCommittedForOrder(shipped)).toBe(false);
    });
});

describe('releaseForOrder', () => {
    it('gives the units back and is at most once', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 4 }
        ]);

        expect(await inventoryService.releaseForOrder(orderId)).toBe(true);
        expect(await inventoryService.releaseForOrder(orderId)).toBe(false);
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 0,
            available: 10
        });
    });

    it('records which story it was', async () => {
        const product = await createProduct({ onHand: 10 });
        const cancelled = anOrderId();
        const abandoned = anOrderId();
        await inventoryService.reserveForOrder(cancelled, [
            { productId: String(product._id), quantity: 1 }
        ]);
        await inventoryService.releaseForOrder(cancelled);
        await inventoryService.reserveForOrder(abandoned, [
            { productId: String(product._id), quantity: 1 }
        ]);
        await inventoryService.releaseForOrder(abandoned, StockMovementReason.expire);

        // Same arithmetic, different reasons — "changed their mind" and "never came back" are
        // different facts about the shop, and only one of them is a conversion problem.
        const ledger = await inventoryService.listMovements({ productId: String(product._id) });
        const reasons = ledger.items.map((row) => row.reason);
        expect(reasons).toContain(StockMovementReason.release);
        expect(reasons).toContain(StockMovementReason.expire);
    });
});

describe('receive', () => {
    it('raises what exists and makes it available immediately', async () => {
        const product = await createProduct({ onHand: 0 });

        const result = await inventoryService.receive(
            String(product._id),
            12,
            'pallet 42',
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ onHand: 12, reserved: 0, available: 12 });
    });

    it('does not disturb an existing hold', async () => {
        const product = await createProduct({ onHand: 5 });
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 5 }
        ]);

        const result = await inventoryService.receive(
            String(product._id),
            10,
            undefined,
            testCallerContext
        );

        // The hold is untouched; the delivery is what becomes sellable.
        expect(result.data).toMatchObject({ onHand: 15, reserved: 5, available: 10 });
    });

    it('writes the ledger newest first', async () => {
        const product = await createProduct({ onHand: 0 });
        await inventoryService.receive(String(product._id), 1, 'first', testCallerContext);
        await inventoryService.receive(String(product._id), 2, 'second', testCallerContext);

        const { items } = await inventoryService.listMovements({ productId: String(product._id) });

        expect(items.map((movement) => movement.onHandDelta)).toEqual([2, 1]);
    });

    it('404s for a product that does not exist', async () => {
        const result = await inventoryService.receive(
            'c'.repeat(24),
            5,
            undefined,
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });
});

describe('adjust', () => {
    it('applies a correction in either direction', async () => {
        const product = await createProduct({ onHand: 10 });

        const down = await inventoryService.adjust(
            String(product._id),
            -3,
            'damaged',
            testCallerContext
        );
        expect(down.data).toMatchObject({ onHand: 7 });

        const up = await inventoryService.adjust(
            String(product._id),
            2,
            'miscount',
            testCallerContext
        );
        expect(up.data).toMatchObject({ onHand: 9 });
    });

    it('refuses a correction that would go below what is already promised', async () => {
        const product = await createProduct({ onHand: 10 });
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 8 }
        ]);

        const result = await inventoryService.adjust(
            String(product._id),
            -5,
            'stocktake',
            testCallerContext
        );

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
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 10,
            reserved: 8,
            available: 2
        });
    });

    it('refuses a correction below units paid for and not yet shipped', async () => {
        const product = await createProduct({ onHand: 10 });
        const orderId = anOrderId();
        await inventoryService.reserveForOrder(orderId, [
            { productId: String(product._id), quantity: 3 }
        ]);
        await inventoryService.commitForOrder(orderId);

        // `onHand` is the shelf count until dispatch, so the paid units are still inside it and
        // still promised: a correction cutting below them is refused.
        const result = await inventoryService.adjust(
            String(product._id),
            -8,
            'stocktake',
            testCallerContext
        );

        expect(result.status).toBe(409);
        expect(await countersOf(String(product._id))).toMatchObject({ onHand: 10, reserved: 3 });
    });

    it('allows a correction down to exactly what is promised', async () => {
        const product = await createProduct({ onHand: 10 });
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(product._id), quantity: 8 }
        ]);

        const result = await inventoryService.adjust(
            String(product._id),
            -2,
            'stocktake',
            testCallerContext
        );

        // The boundary is inclusive: onHand may equal reserved, it may not fall below it.
        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ onHand: 8, reserved: 8, available: 0 });
    });

    it('404s for a product that does not exist', async () => {
        const result = await inventoryService.adjust(
            'c'.repeat(24),
            -1,
            undefined,
            testCallerContext
        );

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
         * would waste an operator's time chasing a stock conflict that doesn't exist. Spying on
         * `applyDelta` (the actual guarded write, now inventory's own) rather than a products
         * function — the product still exists at the pre-check above, it is deleted as a side
         * effect of the write itself, simulating a race rather than mocking one out of existence.
         */
        const spy = jest
            .spyOn(stockLevelRepository, 'applyDelta')
            .mockImplementation(async (id) => {
                // Through the test factory's raw door, like any cross-module reach for a
                // hydrated document — `eslint-plugin-boundaries` fails a spec that touches a
                // sibling's model directly, and it is right to.
                const doomed = await readProduct(id);
                if (doomed) await deleteProduct(doomed);
                return false;
            });

        const result = await inventoryService.adjust(productId, -1, 'stocktake', testCallerContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        spy.mockRestore();
    });
});

describe('runReservationSweep', () => {
    it('releases stale holds and leaves fresh ones alone', async () => {
        const product = await createProduct({ onHand: 20 });
        const fresh = anOrderId();
        await inventoryService.reserveForOrder(fresh, [
            { productId: String(product._id), quantity: 5 }
        ]);

        let stale = '';
        await withoutWindow(async () => {
            stale = anOrderId();
            await inventoryService.reserveForOrder(stale, [
                { productId: String(product._id), quantity: 5 }
            ]);
        });

        const expired = await inventoryService.runReservationSweep();

        expect(expired).toBe(1);
        // The fresh hold survives — a sweep is a deadline, not a purge.
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 20,
            reserved: 5,
            available: 15
        });
        const freshHold = await reservationRepository.findByOrderId(fresh);
        const staleHold = await reservationRepository.findByOrderId(stale);
        expect(freshHold?.status).toBe('held');
        expect(staleHold?.status).toBe('released');
    });

    // One batch per tick was 200 holds every five minutes, so anyone minting holds faster than
    // that kept stock locked past its window. The sweep keeps reading batches until one is short.
    it('drains every stale hold, past one batch of 200', async () => {
        const product = await createProduct({ onHand: 1000 });
        await withoutWindow(async () => {
            const orderIds = Array.from({ length: 450 }, () => anOrderId());
            for (let start = 0; start < orderIds.length; start += 50)
                await Promise.all(
                    orderIds
                        .slice(start, start + 50)
                        .map((orderId) =>
                            inventoryService.reserveForOrder(orderId, [
                                { productId: String(product._id), quantity: 1 }
                            ])
                        )
                );
        });

        const expired = await inventoryService.runReservationSweep();

        expect(expired).toBe(450);
        expect(await reservationModel.countDocuments({ status: 'held' })).toBe(0);
        expect(await countersOf(String(product._id))).toEqual({
            onHand: 1000,
            reserved: 0,
            available: 1000
        });
    }, 60_000);

    it('is idempotent', async () =>
        withoutWindow(async () => {
            const product = await createProduct({ onHand: 20 });
            await inventoryService.reserveForOrder(anOrderId(), [
                { productId: String(product._id), quantity: 5 }
            ]);

            expect(await inventoryService.runReservationSweep()).toBe(1);
            expect(await inventoryService.runReservationSweep()).toBe(0);
            expect(await countersOf(String(product._id))).toEqual({
                onHand: 20,
                reserved: 0,
                available: 20
            });
        }));

    it('skips a hold whose counters refuse, keeps it due, and still expires the rest', async () =>
        withoutWindow(async () => {
            const broken = await createProduct({ onHand: 20 });
            const healthy = await createProduct({ onHand: 20 });
            const brokenOrder = anOrderId();
            const healthyOrder = anOrderId();
            await inventoryService.reserveForOrder(brokenOrder, [
                { productId: String(broken._id), quantity: 5 }
            ]);
            await inventoryService.reserveForOrder(healthyOrder, [
                { productId: String(healthy._id), quantity: 5 }
            ]);
            // Records that disagree with the hold: nothing reserved left to give back.
            await stockLevelModel.updateOne({ productId: broken._id }, { $set: { reserved: 0 } });

            expect(await inventoryService.runReservationSweep()).toBe(1);
            const brokenHold = await reservationRepository.findByOrderId(brokenOrder);
            const healthyHold = await reservationRepository.findByOrderId(healthyOrder);
            expect(brokenHold?.status).toBe('held');
            expect(healthyHold?.status).toBe('released');
        }));
});

describe('listLevels', () => {
    it('reports both counters and the availability they imply, scarcest first', async () => {
        await createProduct({ title: 'Empty', onHand: 0 });
        await createProduct({ title: 'Plenty', onHand: 100 });
        const allHeld = await createProduct({ title: 'All held', onHand: 30 });
        await inventoryService.reserveForOrder(anOrderId(), [
            { productId: String(allHeld._id), quantity: 30 }
        ]);

        const result = await inventoryService.listLevels();

        // The two zero-availability rows sort ahead of the plentiful one, and they are
        // distinguishable — which is the whole reason the board shows three numbers. Which of
        // the two comes first is deliberately unasserted: the API-composition board breaks an
        // availability tie by `_id`, not by title (no join to sort a title by), so their relative
        // order is an implementation detail, not a contract.
        expect(result.items.map((level) => level.available)).toEqual([0, 0, 100]);
        expect(result.items.map((level) => level.title)).toEqual(
            expect.arrayContaining(['All held', 'Empty'])
        );
        expect(result.items.at(-1)).toMatchObject({ title: 'Plenty', onHand: 100, available: 100 });
        expect(result.items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ onHand: 30, reserved: 30, available: 0 }),
                expect.objectContaining({ onHand: 0, reserved: 0, available: 0 }),
                expect.objectContaining({ onHand: 100, reserved: 0, available: 100 })
            ])
        );
        expect(result.meta).toMatchObject({ totalItems: 3, totalPages: 1 });
    });

    it('narrows to what needs ordering when asked', async () => {
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: '5' });
        await createProduct({ title: 'Low', onHand: 2 });
        await createProduct({ title: 'Fine', onHand: 500 });

        const result = await inventoryService.listLevels({ lowOnly: true });

        expect(result.items.map((level) => level.title)).toEqual(['Low']);
        // The total follows the filter, not the collection — otherwise the board would report
        // two pages of scarce products and render one row.
        expect(result.meta.totalItems).toBe(1);
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: undefined });
    });

    it('counts "low" as at or under the threshold, so a product exactly on it is listed', async () => {
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: '5' });
        await createProduct({ title: 'On the line', onHand: 5 });
        await createProduct({ title: 'Just above', onHand: 6 });

        const result = await inventoryService.listLevels({ lowOnly: true });

        expect(result.items.map((level) => level.title)).toEqual(['On the line']);
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: undefined });
    });

    it('keeps a preorder product on the board: the stock board counts the whole catalogue', async () => {
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: '5' });
        await createProduct({
            title: 'Waiting',
            onHand: 0,
            releaseDate: new Date(Date.now() + 30 * 86_400_000).toISOString()
        });

        const result = await inventoryService.listLevels({ lowOnly: true });

        expect(result.items.map((level) => level.title)).toEqual(['Waiting']);
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: undefined });
    });

    it('deliberately disagrees with the metrics gauge over an inactive product', async () => {
        // docs/modules/inventory-reservations.md §"The threshold, and its two readers": this
        // reader (the stock board) counts the WHOLE catalogue, an admin restocking needs to see
        // an inactive product too. `products_low_stock_total` (`lowStockCount`) counts PUBLIC
        // products only. "The two numbers will not match, and should not."
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: '5' });
        await createProduct({ active: true, onHand: 2, reserved: 0 });
        await createProduct({ active: true, onHand: 40, reserved: 40 });
        const hidden = await createProduct({ active: false, onHand: 1, reserved: 0 });

        const board = await inventoryService.listLevels({ lowOnly: true });
        const gauge = await inventoryService.lowStockCount();

        expect(board.meta.totalItems).toBe(3);
        expect(gauge).toBe(2);
        expect(board.items.map((level) => level.productId)).toContain(String(hidden._id));
        setEnvironment({ NODE_LOW_STOCK_THRESHOLD: undefined });
    });

    it('pages rather than reading the whole catalogue', async () => {
        for (let index = 0; index < 5; index += 1)
            await createProduct({ title: `P${index}`, onHand: index });

        const result = await inventoryService.listLevels({ page: 2, pageSize: 2 });

        expect(result.items.map((level) => level.available)).toEqual([2, 3]);
        expect(result.meta).toMatchObject({
            page: 2,
            pageSize: 2,
            totalItems: 5,
            totalPages: 3
        });
    });
});
