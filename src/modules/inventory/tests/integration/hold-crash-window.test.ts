/**
 * @module
 * A crash between claiming a hold and moving its counters leaves neither half done.
 *
 * `commitForOrder`, `shipForOrder`, `releaseForOrder` and `releaseCommittedForOrder` claim the hold's status and move every
 * line's counters in one transaction. A write that throws partway undoes the claim too, so the
 * retry claims again and finishes the job, rather than finding the hold closed and reporting
 * "already done" while the counters never moved.
 *
 * Checked after the failed call AND the retry: the level agrees with the hold's status.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { StockMovementReason } from '@types';
import { inventoryService } from '../../services';
import { reservationRepository, stockLevelRepository } from '../../repository';
import { stockLevelModel, reservationModel, stockMovementModel } from '../../model';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/** An order id, valid as an ObjectId. */
const ORDER = 'e'.repeat(24);

/** Make the next `applyDelta` of this `reason` throw once, as a dropped connection would. */
const failOnce = (reason: StockMovementReason): void => {
    const real = stockLevelRepository.applyDelta;
    let armed = true;
    jest.spyOn(stockLevelRepository, 'applyDelta').mockImplementation(
        (id, why, quantity, delta, session) => {
            if (armed && why === reason) {
                armed = false;
                return Promise.reject(new Error('connection reset'));
            }
            return real(id, why, quantity, delta, session);
        }
    );
};

/** The level row's counters. */
const levelOf = (productId: string) =>
    stockLevelRepository
        .findByProductId(productId)
        .then((level) => ({ onHand: level?.onHand, reserved: level?.reserved }));

describe('a crash between the claim and the counter move', () => {
    it('ship: a retry takes the units off the shelf', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        await inventoryService.reserveForOrder(ORDER, [{ productId, quantity: 4 }]);
        await inventoryService.commitForOrder(ORDER);
        failOnce(StockMovementReason.ship);

        await expect(inventoryService.shipForOrder(ORDER)).rejects.toThrow('connection reset');
        const hold = await reservationRepository.findByOrderId(ORDER);
        expect(hold?.status).toBe('committed');
        await inventoryService.shipForOrder(ORDER);

        expect(await levelOf(productId)).toEqual({ onHand: 6, reserved: 0 });
    });

    it('release: a retry gives the units back', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        await inventoryService.reserveForOrder(ORDER, [{ productId, quantity: 4 }]);
        failOnce(StockMovementReason.release);

        await expect(inventoryService.releaseForOrder(ORDER)).rejects.toThrow('connection reset');
        await inventoryService.releaseForOrder(ORDER);

        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 0 });
    });

    it('release of a paid claim: a retry makes the units sellable again', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        await inventoryService.reserveForOrder(ORDER, [{ productId, quantity: 4 }]);
        await inventoryService.commitForOrder(ORDER);
        failOnce(StockMovementReason.release);

        await expect(inventoryService.releaseCommittedForOrder(ORDER)).rejects.toThrow(
            'connection reset'
        );
        await inventoryService.releaseCommittedForOrder(ORDER);

        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 0 });
    });
});

describe('a line whose counters refuse', () => {
    it('rolls the claim and every earlier line back', async () => {
        const first = await createProduct({ onHand: 10 });
        const second = await createProduct({ onHand: 10 });
        const [firstId, secondId] = [String(first._id), String(second._id)].toSorted();
        await inventoryService.reserveForOrder(ORDER, [
            { productId: firstId, quantity: 4 },
            { productId: secondId, quantity: 4 }
        ]);
        // Records that disagree with the hold: the later line has nothing reserved to ship.
        await stockLevelModel.updateOne({ productId: secondId }, { $set: { reserved: 0 } });

        await expect(inventoryService.shipForOrder(ORDER)).rejects.toThrow('the counters refused');

        const hold = await reservationRepository.findByOrderId(ORDER);
        expect(hold?.status).toBe('held');
        expect(await levelOf(firstId)).toEqual({ onHand: 10, reserved: 4 });
    });
});

/** Ids of the ledger rows that name the order, oldest first. */
const ledgerIdsOf = (orderId: string): Promise<string[]> =>
    stockMovementModel
        .find({ reference: orderId })
        .sort({ _id: 1 })
        .exec()
        .then((rows) => rows.map((row) => String(row._id)));

/** How many lines the order's hold names right now. */
const itemCount = (): Promise<number> =>
    reservationRepository.findByOrderId(ORDER).then((hold) => hold?.items.length ?? 0);

describe('a checkout killed between two lines', () => {
    it("lets the sweep free only the lines it took, never another order's units", async () => {
        const first = await createProduct({ onHand: 10 });
        const second = await createProduct({ onHand: 10 });
        const [firstId, secondId] = [String(first._id), String(second._id)].toSorted();
        const other = 'f'.repeat(24);
        await inventoryService.reserveForOrder(other, [
            { productId: firstId, quantity: 2 },
            { productId: secondId, quantity: 4 }
        ]);

        /**
         * The second line's counter write waits for the sweep, as a killed process would never
         * get there; it is released afterwards so no transaction hangs past teardown.
         */
        const realApplyDelta = stockLevelRepository.applyDelta;
        const gate: { open?: () => void } = {};
        const sweepDone = new Promise<void>((resolve) => {
            gate.open = resolve;
        });
        jest.spyOn(stockLevelRepository, 'applyDelta').mockImplementation(
            async (productId, reason, quantity, delta, session) => {
                if (productId === secondId && reason === StockMovementReason.reserve)
                    await sweepDone;
                return realApplyDelta(productId, reason, quantity, delta, session);
            }
        );
        const checkout = inventoryService.reserveForOrder(ORDER, [
            { productId: firstId, quantity: 3 },
            { productId: secondId, quantity: 3 }
        ]);
        const outcome = checkout.then(
            () => 'resolved',
            () => 'rejected'
        );

        // Wait until the first line is in the hold, then expire it and sweep.
        while ((await itemCount()) === 0) await new Promise((resolve) => setTimeout(resolve, 5));
        await reservationModel.updateOne({ orderId: ORDER }, { expiresAt: new Date(0) });
        await inventoryService.runReservationSweep();
        const swept = await reservationRepository.findByOrderId(ORDER);
        const levels = [await levelOf(firstId), await levelOf(secondId)];
        const sweepRows = await ledgerIdsOf(ORDER);
        gate.open?.();

        expect(swept?.status).toBe('released');
        expect(levels[0]).toEqual({ onHand: 10, reserved: 2 });
        // The other order's units on both products are untouched: the sweep did not release the line never taken.
        expect(levels[1]).toEqual({ onHand: 10, reserved: 4 });
        expect(await outcome).toBe('rejected');
        expect(await levelOf(secondId)).toEqual({ onHand: 10, reserved: 4 });
        expect(await levelOf(firstId)).toEqual({ onHand: 10, reserved: 2 });
        const held = await reservationRepository.findByOrderId(ORDER);
        expect(held?.status).toBe('released');
        /**
         * The unwind found the hold already released: it gave nothing back a second time and
         * left the sweep's ledger rows (the take and the release of A) exactly as they were.
         */
        expect(sweepRows).toHaveLength(2);
        expect(await ledgerIdsOf(ORDER)).toEqual(sweepRows);
    });
});

describe('a rollback whose release throws', () => {
    it('keeps the hold held, and the sweep frees the units', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        // The second line has no level row, so the reserve refuses and unwinds the first line.
        const missing = 'f'.repeat(24);
        failOnce(StockMovementReason.release);

        const outcome = await inventoryService.reserveForOrder(ORDER, [
            { productId, quantity: 4 },
            { productId: missing, quantity: 1 }
        ]);

        expect(outcome.held).toBe(false);

        const hold = await reservationRepository.findByOrderId(ORDER);
        expect(hold?.status).toBe('held');
        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 4 });

        await reservationModel.updateOne({ orderId: ORDER }, { expiresAt: new Date(0) });
        await inventoryService.runReservationSweep();

        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 0 });
    });
});

describe('a checkout unwinding while the sweep that claimed its hold is still finishing', () => {
    it("leaves the catalogue's stock cache equal to the level", async () => {
        const first = await createProduct({ onHand: 10 });
        const second = await createProduct({ onHand: 10 });
        const [firstId, secondId] = [String(first._id), String(second._id)].toSorted();
        await inventoryService.reserveForOrder('f'.repeat(24), [
            { productId: firstId, quantity: 2 }
        ]);

        // The second line waits, as in a checkout killed between lines.
        const realApplyDelta = stockLevelRepository.applyDelta;
        const lineGate: { open?: () => void } = {};
        const lineWaits = new Promise<void>((resolve) => {
            lineGate.open = resolve;
        });
        jest.spyOn(stockLevelRepository, 'applyDelta').mockImplementation(
            async (productId, reason, quantity, delta, session) => {
                if (productId === secondId && reason === StockMovementReason.reserve)
                    await lineWaits;
                return realApplyDelta(productId, reason, quantity, delta, session);
            }
        );
        const checkout = inventoryService.reserveForOrder(ORDER, [
            { productId: firstId, quantity: 3 },
            { productId: secondId, quantity: 3 }
        ]);
        const outcome = checkout.then(
            () => 'resolved',
            () => 'rejected'
        );
        while ((await itemCount()) === 0) await new Promise((resolve) => setTimeout(resolve, 5));

        /**
         * The sweep's post-commit read of the hold (which names the cache rows to refresh) waits
         * until the checkout has finished unwinding.
         */
        const realFind = reservationRepository.findByOrderId.bind(reservationRepository);
        const readGate: { open?: () => void } = {};
        const readWaits = new Promise<void>((resolve) => {
            readGate.open = resolve;
        });
        const readReached: { reached?: () => void } = {};
        const sweepRead = new Promise<void>((resolve) => {
            readReached.reached = resolve;
        });
        jest.spyOn(reservationRepository, 'findByOrderId').mockImplementation(async (orderId) => {
            readReached.reached?.();
            await readWaits;
            return realFind(orderId);
        });
        await reservationModel.updateOne({ orderId: ORDER }, { expiresAt: new Date(0) });
        const sweep = inventoryService.runReservationSweep();
        await sweepRead;

        lineGate.open?.();
        expect(await outcome).toBe('rejected');
        readGate.open?.();
        await sweep;

        const level = await levelOf(firstId);
        const cached = await countersOf(firstId);
        expect({ onHand: cached.onHand, reserved: cached.reserved }).toEqual(level);
    });
});
