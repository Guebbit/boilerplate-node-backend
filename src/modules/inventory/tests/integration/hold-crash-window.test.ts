/**
 * @module
 * A crash between claiming a hold and moving its counters leaves neither half done.
 *
 * `commitForOrder`, `releaseForOrder` and `restockForOrder` claim the hold's status and move every
 * line's counters in one transaction. A write that throws partway undoes the claim too, so the
 * retry claims again and finishes the job, rather than finding the hold closed and reporting
 * "already done" while the counters never moved.
 *
 * Checked after the failed call AND the retry: the level agrees with the hold's status.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { StockMovementReason } from '@types';
import { commitForOrder, releaseForOrder, reserveForOrder, restockForOrder } from '../../services';
import { stockLevelRepository } from '../../repository';

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
    it('commit: a retry finishes the sale', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        await reserveForOrder(ORDER, [{ productId, quantity: 4 }]);
        failOnce(StockMovementReason.commit);

        await expect(commitForOrder(ORDER)).rejects.toThrow('connection reset');
        await commitForOrder(ORDER);

        expect(await levelOf(productId)).toEqual({ onHand: 6, reserved: 0 });
    });

    it('release: a retry gives the units back', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        await reserveForOrder(ORDER, [{ productId, quantity: 4 }]);
        failOnce(StockMovementReason.release);

        await expect(releaseForOrder(ORDER)).rejects.toThrow('connection reset');
        await releaseForOrder(ORDER);

        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 0 });
    });

    it('restock: a retry puts the sold units back on the shelf', async () => {
        const product = await createProduct({ onHand: 10 });
        const productId = String(product._id);
        await reserveForOrder(ORDER, [{ productId, quantity: 4 }]);
        await commitForOrder(ORDER);
        failOnce(StockMovementReason.restock);

        await expect(restockForOrder(ORDER)).rejects.toThrow('connection reset');
        await restockForOrder(ORDER);

        expect(await levelOf(productId)).toEqual({ onHand: 10, reserved: 0 });
    });
});
