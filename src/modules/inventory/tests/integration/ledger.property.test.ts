/**
 * @module
 * Property-based tests — replaying a product's ledger reproduces its counters exactly
 * (`sum(onHandDelta) == onHand - opening`, same for `reserved`), for EVERY sequence of
 * transitions, not just a table of examples. Guaranteed because a ledger row is written by the
 * same conditional write that moves the counter, so the two cannot diverge.
 *
 * Runs against real Mongo (`setupTestDb`), since the guarantee lives in the conditional writes —
 * mocking the repository would only re-test `counterDeltaFor`'s arithmetic, already covered more
 * cheaply by `transitions.test.ts`. The run is seeded for reproducibility; any counterexample
 * found gets written back as an ordinary `it()` with its seed.
 */

import fc from 'fast-check';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/fixtures';
import { productRepository } from '@modules/products';
import { StockMovementReason } from '@types';
import { inventoryService } from '@modules/inventory';
import { stockMovementRepository } from '../../repository';
import { stockMovementModel } from '../../model';

setupTestDb();

/** One seed for the file, and one place to change it. */
const RUN = { seed: 20_260_817, numRuns: 40, endOnFailure: true } as const;

/**
 * The opening count every case starts from.
 *
 * Large enough that a run of receipts and reserves has room to move without every second
 * transition being refused for lack of units — a sequence that is refused end to end would
 * satisfy the property trivially (no rows, no movement) and prove nothing.
 */
const OPENING_ON_HAND = 500;

/**
 * One step a generated sequence can take, in the vocabulary a CALLER has.
 *
 * Deliberately not "call `applyTransition` with reason X": that would drive the private
 * chokepoint directly and prove only that it is self-consistent. These are the four things the
 * outside world can actually ask for, so the property is asserted against the module's real
 * surface — including the reservation lifecycle, which is where the interesting refusals live.
 */
type Step =
    | { kind: 'receive'; quantity: number }
    | { kind: 'adjust'; delta: number }
    | { kind: 'reserve'; quantity: number }
    | { kind: 'commit' }
    | { kind: 'release' }
    | { kind: 'expire' };

const step = (): fc.Arbitrary<Step> =>
    fc.oneof(
        fc.record({
            kind: fc.constant('receive' as const),
            quantity: fc.integer({ min: 1, max: 50 })
        }),
        fc.record({
            kind: fc.constant('adjust' as const),
            // Both directions, and zero excluded the way the endpoint excludes it.
            delta: fc.integer({ min: -40, max: 40 }).filter((value) => value !== 0)
        }),
        fc.record({
            kind: fc.constant('reserve' as const),
            quantity: fc.integer({ min: 1, max: 30 })
        }),
        fc.constant({ kind: 'commit' as const }),
        fc.constant({ kind: 'release' as const }),
        fc.constant({ kind: 'expire' as const })
    );

/**
 * Drive one generated sequence against a real product.
 *
 * Every hold is keyed by an order id, so the sequence carries its own counter of them: a
 * `reserve` opens the next one and `commit`/`release`/`expire` resolve whichever is currently
 * open. That mirrors how the shop actually works — one live hold per order — and it means the
 * generated refusals are the real ones (committing when nothing is held, reserving more than is
 * available) rather than invented.
 */
const play = async (productId: string, steps: readonly Step[]): Promise<void> => {
    let holdCounter = 0;
    let openOrderId: string | null = null;

    // A syntactically valid, unique ObjectId per hold, derived rather than random so a failing
    // run replays identically.
    const nextOrderId = () => (++holdCounter).toString(16).padStart(24, 'a');

    for (const current of steps)
        switch (current.kind) {
            case 'receive': {
                await inventoryService.receive(productId, current.quantity);
                break;
            }
            case 'adjust': {
                await inventoryService.adjust(productId, current.delta);
                break;
            }
            case 'reserve': {
                if (openOrderId) break;
                const orderId = nextOrderId();
                const { held } = await inventoryService.reserveForOrder(orderId, [
                    { productId, quantity: current.quantity }
                ]);
                if (held) openOrderId = orderId;
                break;
            }
            case 'commit': {
                if (!openOrderId) break;
                await inventoryService.commitForOrder(openOrderId);
                openOrderId = null;
                break;
            }
            case 'release': {
                if (!openOrderId) break;
                await inventoryService.releaseForOrder(openOrderId);
                openOrderId = null;
                break;
            }
            case 'expire': {
                if (!openOrderId) break;
                await inventoryService.releaseForOrder(openOrderId, StockMovementReason.expire);
                openOrderId = null;
                break;
            }
        }
};

/** What the ledger says happened to this product, summed per column. */
const replay = async (productId: string) => {
    const rows = await stockMovementModel.find({ productId }).exec();
    return {
        onHandDelta: rows.reduce((total, row) => total + (row.onHandDelta ?? 0), 0),
        reservedDelta: rows.reduce((total, row) => total + (row.reservedDelta ?? 0), 0),
        rows: rows.length
    };
};

describe('the ledger reproduces the counters', () => {
    it('replaying every row lands exactly on both stored counters', async () => {
        await fc.assert(
            fc.asyncProperty(fc.array(step(), { minLength: 1, maxLength: 25 }), async (steps) => {
                const product = await createProduct({ onHand: OPENING_ON_HAND, reserved: 0 });
                const productId = String(product._id);

                await play(productId, steps);

                const stored = await productRepository.findByIdRaw(productId);
                const ledger = await replay(productId);

                // The opening count is the ledger's starting balance: rows explain CHANGES since
                // the product was created, exactly as an account statement explains changes since
                // its opening balance rather than inventing the whole history of the money.
                expect(stored?.onHand).toBe(OPENING_ON_HAND + ledger.onHandDelta);
                expect(stored?.reserved).toBe(0 + ledger.reservedDelta);
            }),
            RUN
        );
    });

    it('never lets either counter go negative, whatever the sequence', async () => {
        await fc.assert(
            fc.asyncProperty(fc.array(step(), { minLength: 1, maxLength: 25 }), async (steps) => {
                const product = await createProduct({ onHand: OPENING_ON_HAND, reserved: 0 });
                const productId = String(product._id);

                await play(productId, steps);

                const stored = await productRepository.findByIdRaw(productId);
                expect(stored?.onHand).toBeGreaterThanOrEqual(0);
                expect(stored?.reserved).toBeGreaterThanOrEqual(0);
                // The invariant every guard in the repository exists to protect: you cannot have
                // promised more units than you hold.
                expect(stored?.reserved ?? 0).toBeLessThanOrEqual(stored?.onHand ?? 0);
            }),
            RUN
        );
    });

    it('writes no row for a transition that was refused', async () => {
        // The other half of "a counter never moves without a row": a row never appears without a
        // counter moving. Reserving more than exists is the cheapest refusal to provoke.
        const product = await createProduct({ onHand: 2, reserved: 0 });
        const productId = String(product._id);

        const outcome = await inventoryService.reserveForOrder('a'.repeat(24), [
            { productId, quantity: 99 }
        ]);

        expect(outcome.held).toBe(false);
        expect(await replay(productId)).toMatchObject({ rows: 0 });

        const ledger = await stockMovementRepository.search({ productId });
        expect(ledger.items).toEqual([]);
        expect(ledger.meta.totalItems).toBe(0);
    });
});
