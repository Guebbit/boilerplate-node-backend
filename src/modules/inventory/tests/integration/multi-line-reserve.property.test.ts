/**
 * @module
 * Property-based: whatever mix of multi-line holds, commits, releases and expiries a shop sees,
 * the stock level agrees with the open holds. The two invariants every guard in the repository
 * exists for, stated once over generated sequences instead of a table of examples:
 *
 *   - `reserved` of a product == the sum, over every `held` reservation, of that product's lines.
 *   - `available == onHand - reserved`, and `onHand` has dropped by exactly what was committed.
 *
 * A refused multi-line hold must leave NOTHING behind, which is what keeps the first invariant
 * true after a rollback. Real Mongo, seeded, same pattern as `ledger.property.test.ts`.
 */

import fc from 'fast-check';
import { setupTestDb } from '@tests/setup-test-db';
import { PROPERTY_RUNS_WITH_DATABASE } from '@tests/knobs';
import { createProduct } from '@modules/products/tests/factories';
import { StockMovementReason } from '@types';
import { inventoryService } from '../../services';
import { reservationModel, stockLevelModel } from '../../model';

setupTestDb();

/** One seed for the file; the count is `TEST_PROPERTY_RUNS_DB`. */
const RUN = { seed: 20_261_004, numRuns: PROPERTY_RUNS_WITH_DATABASE, endOnFailure: true } as const;

/** Units each product starts with: scarce enough that generated holds contend and refuse. */
const OPENING_ON_HAND = 8;

/** How many products a generated shop sells. */
const PRODUCT_COUNT = 3;

/** One generated order line: which product (by index) and how many. */
interface Line {
    product: number;
    quantity: number;
}

/** One step a generated shop takes. */
type Step =
    | { kind: 'place'; lines: Line[] }
    | { kind: 'resolve'; which: number; how: 'commit' | 'release' | 'expire' };

/** A multi-line order: distinct products in an arbitrary order, like a cart's lines. */
const placeStep = (): fc.Arbitrary<Step> =>
    fc
        .uniqueArray(fc.integer({ min: 0, max: PRODUCT_COUNT - 1 }), { minLength: 1, maxLength: 3 })
        .chain((products) =>
            fc.tuple(...products.map(() => fc.integer({ min: 1, max: 6 }))).map((quantities) => ({
                kind: 'place' as const,
                lines: products.map((product, index) => ({
                    product,
                    quantity: quantities[index] ?? 1
                }))
            }))
        );

/** Resolve one of the currently open holds, picked by index modulo how many there are. */
const resolveStep = (): fc.Arbitrary<Step> =>
    fc.record({
        kind: fc.constant('resolve' as const),
        which: fc.nat({ max: 50 }),
        how: fc.constantFrom('commit' as const, 'release' as const, 'expire' as const)
    });

/** What every hold ended as, for the summation the invariants are checked against. */
interface Outcome {
    /** Units still held, per product id. */
    held: Map<string, number>;
    /** Units committed (sold), per product id. */
    committed: Map<string, number>;
}

/** Add `quantity` to `key`'s running total. */
const addTo = (totals: Map<string, number>, key: string, quantity: number): void => {
    totals.set(key, (totals.get(key) ?? 0) + quantity);
};

/**
 * Play a generated shop and report what ended up held and committed, from the HOLDS themselves
 * (`reservations`), never from the counters under test.
 */
const play = async (productIds: readonly string[], steps: readonly Step[]): Promise<Outcome> => {
    let counter = 0;
    const open: string[] = [];

    for (const current of steps)
        if (current.kind === 'place') {
            counter += 1;
            // A syntactically valid, unique ObjectId per order, derived so a failing run replays.
            const orderId = counter.toString(16).padStart(24, 'c');
            const outcome = await inventoryService.reserveForOrder(
                orderId,
                current.lines.map(({ product, quantity }) => ({
                    productId: productIds[product] ?? '',
                    quantity
                }))
            );
            if (outcome.held) open.push(orderId);
        } else if (open.length > 0) {
            const [orderId] = open.splice(current.which % open.length, 1);
            if (orderId === undefined) continue;
            if (current.how === 'commit') await inventoryService.commitForOrder(orderId);
            else
                await inventoryService.releaseForOrder(
                    orderId,
                    current.how === 'expire'
                        ? StockMovementReason.expire
                        : StockMovementReason.release
                );
        }

    const outcome: Outcome = { held: new Map(), committed: new Map() };
    for (const reservation of await reservationModel.find({}).lean())
        for (const { productId, quantity } of reservation.items) {
            if (reservation.status === 'held') addTo(outcome.held, String(productId), quantity);
            if (reservation.status === 'committed')
                addTo(outcome.committed, String(productId), quantity);
        }
    return outcome;
};

describe('multi-line holds against the stock level', () => {
    it('reserved equals the open holds, and available equals onHand minus reserved', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(fc.oneof(placeStep(), resolveStep()), { minLength: 1, maxLength: 20 }),
                async (steps) => {
                    const products = await Promise.all(
                        Array.from({ length: PRODUCT_COUNT }, () =>
                            createProduct({ onHand: OPENING_ON_HAND, reserved: 0 })
                        )
                    );
                    const productIds = products.map((product) => String(product._id));
                    await reservationModel.deleteMany({});

                    const { held, committed } = await play(productIds, steps);

                    for (const productId of productIds) {
                        const level = await stockLevelModel.findOne({ productId }).lean();
                        const heldUnits = held.get(productId) ?? 0;
                        const soldUnits = committed.get(productId) ?? 0;

                        expect(level?.reserved).toBe(heldUnits);
                        expect(level?.onHand).toBe(OPENING_ON_HAND - soldUnits);
                        expect(level?.available).toBe(OPENING_ON_HAND - soldUnits - heldUnits);
                        // Never promised more than exists.
                        expect(heldUnits).toBeLessThanOrEqual(OPENING_ON_HAND - soldUnits);
                    }
                }
            ),
            RUN
        );
    });

    it('a refused multi-line hold leaves no reservation and no counter moved', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 2, maxLength: 3 }),
                async (quantities) => {
                    const products = await Promise.all(
                        quantities.map(() => createProduct({ onHand: OPENING_ON_HAND }))
                    );
                    await reservationModel.deleteMany({});
                    // The LAST line is unfulfillable, so every earlier line is taken and must be given back.
                    const lines = products.map((product, index) => ({
                        productId: String(product._id),
                        quantity:
                            index === products.length - 1
                                ? OPENING_ON_HAND + 1
                                : (quantities[index] ?? 1)
                    }));

                    const outcome = await inventoryService.reserveForOrder('d'.repeat(24), lines);

                    expect(outcome.held).toBe(false);
                    expect(await reservationModel.countDocuments({})).toBe(0);
                    for (const { productId } of lines) {
                        const level = await stockLevelModel.findOne({ productId }).lean();
                        expect(level).toMatchObject({
                            onHand: OPENING_ON_HAND,
                            reserved: 0,
                            available: OPENING_ON_HAND
                        });
                    }
                }
            ),
            RUN
        );
    });
});
