/**
 * @module
 * Two multi-line holds racing for the same two products, listing them in OPPOSITE order.
 *
 * `reserveForOrder` takes its lines one conditional write at a time, in a canonical order
 * (sorted by product id), so two orders contend on the same product first and exactly one goes on.
 * Taken in the order given, each order would take its first line before either took its second,
 * find the other's unit gone, and give its own back: both refused, for units that exist.
 *
 * Invariants asserted, whatever the interleaving:
 *   - exactly one stands when the shelf covers one, never both and never neither;
 *   - what stands is what the level shows (`reserved` == units of the holds that stand);
 *   - a refused hold leaves nothing behind.
 *
 * The interleaving is forced with a barrier on the repository's own write, so it is the same on
 * every run instead of depending on the scheduler.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { StockMovementReason } from '@types';
import { reserveForOrder } from '../../services';
import { stockLevelRepository } from '../../repository';
import { reservationModel } from '../../model';

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
});

/**
 * Hold every `reserve` write after the first `firstWrites` until those have all completed.
 * Own method of a plain object, so `jest.spyOn` is safe under the swc mutation harness.
 */
const holdLaterReservesUntilFirstWritesLand = (firstWrites: number): void => {
    const realApplyDelta = stockLevelRepository.applyDelta;
    let started = 0;
    let finished = 0;
    // The barrier: `landed` settles once `barrier.open` is called by the last first-write.
    const barrier: { open?: () => void } = {};
    const firstWritesLanded = new Promise<void>((resolve) => {
        barrier.open = resolve;
    });

    jest.spyOn(stockLevelRepository, 'applyDelta').mockImplementation(
        async (productId, reason, quantity, delta) => {
            if (reason !== StockMovementReason.reserve)
                return realApplyDelta(productId, reason, quantity, delta);
            started += 1;
            const isLater = started > firstWrites;
            if (isLater) await firstWritesLanded;
            const moved = await realApplyDelta(productId, reason, quantity, delta);
            if (!isLater) {
                finished += 1;
                if (finished === firstWrites) barrier.open?.();
            }
            return moved;
        }
    );
};

describe('opposite-order multi-line holds, each taking its first line before the other its second', () => {
    it('lets exactly one stand, and leaves the level equal to the holds that stand', async () => {
        const left = await createProduct({ title: 'Left', onHand: 5 });
        const right = await createProduct({ title: 'Right', onHand: 5 });
        const leftId = String(left._id);
        const rightId = String(right._id);
        holdLaterReservesUntilFirstWritesLand(2);

        const outcomes = await Promise.all([
            reserveForOrder('a'.repeat(24), [
                { productId: leftId, quantity: 3 },
                { productId: rightId, quantity: 3 }
            ]),
            reserveForOrder('b'.repeat(24), [
                { productId: rightId, quantity: 3 },
                { productId: leftId, quantity: 3 }
            ])
        ]);

        const standing = outcomes.filter((outcome) => outcome.held).length;
        // 5 units cover exactly one hold of 3: one order wins, not both lose.
        expect(standing).toBe(1);
        expect(await reservationModel.countDocuments({ status: 'held' })).toBe(standing);
        expect(await reservationModel.countDocuments({})).toBe(standing);
        for (const productId of [leftId, rightId]) {
            const level = await stockLevelRepository.findByProductId(productId);
            expect(level?.reserved).toBe(standing * 3);
            expect(level?.available).toBe(5 - standing * 3);
        }
    });
});
