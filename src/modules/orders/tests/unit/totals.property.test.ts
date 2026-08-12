/**
 * Property-based tests — `src/modules/orders/totals.ts`.
 *
 * `sumLineItems` is the arithmetic behind every order total and every cart summary, and it is
 * total by construction: `Number(…) || 0` absorbs undefined, null and unparseable values so a
 * line whose product failed to populate contributes nothing instead of turning the whole total
 * into `NaN`. "Instead of NaN" is a claim about EVERY input, which is what makes this a property
 * rather than a table of examples — a `NaN` total reaches the customer as a blank price.
 *
 * The invariants below are the ones the plan names: order-independent, non-negative for
 * non-negative input, zero for empty, and additive over concatenation. Each is a statement no
 * single example can make.
 *
 * Determinism, both halves:
 *   - the run is SEEDED, so a failure is reproducible and a passing run is not luck;
 *   - any counterexample this finds gets written back as an ordinary `it()` with its seed in a
 *     comment. The property states the rule; the example remembers the bug.
 */
import fc from 'fast-check';
import { sumLineItems, toCents, type ILineItem } from '../../domain/totals';

/** One seed for the file, and one place to change it. */
const RUN = { seed: 20_260_809, numRuns: 300, endOnFailure: true } as const;

/**
 * The two nullish spellings a failed populate can leave behind.
 *
 * Both are in scope for `Number(...) || 0` and both must contribute 0 rather than NaN, so neither
 * can be dropped to satisfy a lint rule that would rather this codebase had only `undefined`.
 */
const nullish = () => fc.constantFrom(null, undefined);

/** A line item as the two callers actually produce one. */
const lineItem = () =>
    fc.record({
        quantity: fc.integer({ min: 0, max: 1000 }),
        product: fc.record({ price: fc.integer({ min: 0, max: 100_000 }) })
    });

/** A line item with any of the junk a failed populate or a malformed aggregate can leave. */
const hostileLineItem = () =>
    fc.record(
        {
            quantity: fc.oneof(fc.integer(), fc.double(), fc.string(), nullish(), fc.boolean()),
            product: fc.oneof(
                fc.record({ price: fc.oneof(fc.double(), fc.string(), nullish()) }),
                nullish(),
                fc.string(),
                fc.record({})
            )
        },
        { requiredKeys: [] }
    ) as fc.Arbitrary<ILineItem>;

describe('sumLineItems — totality', () => {
    it('never produces NaN, for any input at all', () => {
        // The single most important property here. A NaN total renders as a blank price, and it
        // propagates: one unpopulated product poisons the whole order.
        fc.assert(
            fc.property(fc.array(hostileLineItem()), (items) => {
                const { count, quantity, price } = sumLineItems(items);

                expect(Number.isNaN(count)).toBe(false);
                expect(Number.isNaN(quantity)).toBe(false);
                expect(Number.isNaN(price)).toBe(false);
            }),
            RUN
        );
    });

    it('never throws, for any input at all', () => {
        fc.assert(
            fc.property(fc.array(hostileLineItem()), (items) => {
                expect(() => sumLineItems(items)).not.toThrow();
            }),
            RUN
        );
    });

    it('counts every line, whatever is in it', () => {
        // `count` is the array length and nothing else — a line that contributes 0 to the money
        // still exists. `CartSummary.itemsCount` depends on that distinction.
        fc.assert(
            fc.property(fc.array(hostileLineItem()), (items) => {
                expect(sumLineItems(items).count).toBe(items.length);
            }),
            RUN
        );
    });
});

describe('sumLineItems — arithmetic invariants', () => {
    it('is zero on every axis for an empty cart', () => {
        expect(sumLineItems([])).toEqual({ count: 0, quantity: 0, price: 0 });
    });

    it('is order-independent', () => {
        // Two clients holding the same cart in a different order must be charged the same. This
        // is the property that would catch an accumulator whose rounding depended on sequence.
        fc.assert(
            fc.property(fc.array(lineItem()), (items) => {
                const forwards = sumLineItems(items);
                const backwards = sumLineItems(items.toReversed());

                expect(backwards).toEqual(forwards);
            }),
            RUN
        );
    });

    it('is non-negative for non-negative input', () => {
        fc.assert(
            fc.property(fc.array(lineItem()), (items) => {
                const { quantity, price } = sumLineItems(items);

                expect(quantity).toBeGreaterThanOrEqual(0);
                expect(price).toBeGreaterThanOrEqual(0);
            }),
            RUN
        );
    });

    it('is additive over concatenation, up to cent rounding', () => {
        // sum(a ++ b) === sum(a) + sum(b). The rounding tolerance is the point rather than a
        // fudge: `toCents` rounds ONCE per call, so splitting a cart can legitimately move the
        // total by half a cent per part — and no further.
        fc.assert(
            fc.property(fc.array(lineItem()), fc.array(lineItem()), (left, right) => {
                const combined = sumLineItems([...left, ...right]);
                const separate = sumLineItems(left);
                const other = sumLineItems(right);

                expect(combined.count).toBe(separate.count + other.count);
                expect(combined.quantity).toBe(separate.quantity + other.quantity);
                expect(Math.abs(combined.price - (separate.price + other.price))).toBeLessThan(
                    0.02
                );
            }),
            RUN
        );
    });

    it('scales the price with the quantity', () => {
        // Doubling every quantity doubles the money. Catches a `+` where a `*` belongs, which
        // an example with quantity 1 cannot distinguish.
        fc.assert(
            fc.property(fc.array(lineItem(), { maxLength: 20 }), (items) => {
                const single = sumLineItems(items);
                const doubled = sumLineItems(
                    items.map((item) => ({ ...item, quantity: (item.quantity as number) * 2 }))
                );

                expect(doubled.quantity).toBe(single.quantity * 2);
                expect(Math.abs(doubled.price - single.price * 2)).toBeLessThan(0.02);
            }),
            RUN
        );
    });

    it('ignores a line with zero quantity in the money but not in the count', () => {
        fc.assert(
            fc.property(
                fc.array(lineItem()),
                fc.integer({ min: 0, max: 100_000 }),
                (items, price) => {
                    const withFreeLine = sumLineItems([
                        ...items,
                        { quantity: 0, product: { price } }
                    ]);
                    const without = sumLineItems(items);

                    expect(withFreeLine.price).toBe(without.price);
                    expect(withFreeLine.count).toBe(without.count + 1);
                }
            ),
            RUN
        );
    });
});

describe('toCents', () => {
    it('never returns more than two decimal places', () => {
        // The reason it exists: money is a float here (openapi.yaml types these `double`), so
        // `0.1 + 0.2` style drift would otherwise reach the wire.
        fc.assert(
            fc.property(
                fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
                (value) => {
                    const rounded = toCents(value);

                    expect(Math.abs(Math.round(rounded * 100) - rounded * 100)).toBeLessThan(1e-6);
                }
            ),
            RUN
        );
    });

    it('is idempotent', () => {
        fc.assert(
            fc.property(
                fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
                (value) => {
                    expect(toCents(toCents(value))).toBe(toCents(value));
                }
            ),
            RUN
        );
    });

    it('never moves a value by as much as a cent', () => {
        fc.assert(
            fc.property(
                fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e9, max: 1e9 }),
                (value) => {
                    expect(Math.abs(toCents(value) - value)).toBeLessThanOrEqual(0.005 + 1e-9);
                }
            ),
            RUN
        );
    });
});
