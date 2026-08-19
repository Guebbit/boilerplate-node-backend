/**
 * Property-based tests — `src/modules/orders/domain/money.ts`.
 *
 * `Money` claims that no monetary arithmetic here can produce `NaN`, `Infinity` or a fraction of a
 * cent. That is a statement about EVERY input, so the arbitraries are hostile rather than realistic.
 *
 * Seeded, so a failure reproduces. Any counterexample found gets written back as an ordinary
 * `it()`: the property states the rule, the example remembers the bug.
 *
 * See `docs/theory/tactical-ddd.md` §3.
 */
import fc from 'fast-check';
import {
    addMoney,
    NO_MONEY,
    scaleMoney,
    toDecimalAmount,
    toMinorUnits,
    wholeCount
} from '../../domain/money';

/** One seed for the file, and one place to change it. */
const RUN = { seed: 20_260_819, numRuns: 300, endOnFailure: true } as const;

/** Anything a malformed document, a failed populate or a hostile client can put where a price goes. */
const anything = () =>
    fc.oneof(
        fc.double(),
        fc.integer(),
        fc.string(),
        fc.boolean(),
        fc.constantFrom(null, undefined, Number.MAX_VALUE, -Number.MAX_VALUE, '1e400')
    );

/** A plausible catalogue price, in decimals — the realistic half of the input space. */
const realisticPrice = () => fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1e6 });

describe('toMinorUnits — totality', () => {
    it('returns a finite whole number for any input at all', () => {
        // Every other function takes its input from this one.
        fc.assert(
            fc.property(anything(), (value) => {
                const amount = toMinorUnits(value);

                expect(Number.isFinite(amount)).toBe(true);
                expect(Number.isInteger(amount)).toBe(true);
            }),
            RUN
        );
    });

    it('treats junk as nothing owed rather than as a number to argue with', () => {
        for (const junk of [undefined, null, 'free', {}, [], Number.NaN, Infinity, -Infinity])
            expect(toMinorUnits(junk)).toBe(NO_MONEY);
    });

    it('drops an amount whose minor units overflow, rather than carrying an Infinity', () => {
        // `Number.MAX_VALUE` is finite; a hundred times it is not. Checking the input alone misses it.
        expect(toMinorUnits(Number.MAX_VALUE)).toBe(NO_MONEY);
        expect(toMinorUnits(-Number.MAX_VALUE)).toBe(NO_MONEY);
    });
});

describe('toMinorUnits ↔ toDecimalAmount', () => {
    it('round-trips a realistic price to the cent', () => {
        fc.assert(
            fc.property(realisticPrice(), (price) => {
                const returned = toDecimalAmount(toMinorUnits(price));

                expect(Math.abs(returned - price)).toBeLessThanOrEqual(0.005 + 1e-9);
            }),
            RUN
        );
    });

    it('never returns more than two decimal places', () => {
        // Drift here reaches the wire as a price no invoice can add up.
        fc.assert(
            fc.property(anything(), (value) => {
                const returned = toDecimalAmount(toMinorUnits(value));

                expect(Math.abs(Math.round(returned * 100) - returned * 100)).toBeLessThan(1e-6);
            }),
            RUN
        );
    });

    it('is idempotent through a round trip', () => {
        fc.assert(
            fc.property(realisticPrice(), (price) => {
                const once = toDecimalAmount(toMinorUnits(price));

                expect(toDecimalAmount(toMinorUnits(once))).toBe(once);
            }),
            RUN
        );
    });
});

describe('addMoney', () => {
    it('is exact, associative and order-independent', () => {
        // The reason the type exists — float addition is none of these three.
        fc.assert(
            fc.property(fc.array(realisticPrice(), { maxLength: 30 }), (prices) => {
                const amounts = prices.map((price) => toMinorUnits(price));
                const forwards = addMoney(...amounts);

                expect(addMoney(...amounts.toReversed())).toBe(forwards);
                expect(addMoney(addMoney(...amounts), NO_MONEY)).toBe(forwards);
            }),
            RUN
        );
    });

    it('folds an empty list to nothing owed', () => {
        expect(addMoney()).toBe(NO_MONEY);
    });

    it('stays finite however hostile the terms', () => {
        fc.assert(
            fc.property(fc.array(anything(), { maxLength: 30 }), (values) => {
                expect(Number.isFinite(addMoney(...values.map((v) => toMinorUnits(v))))).toBe(true);
            }),
            RUN
        );
    });
});

describe('scaleMoney', () => {
    it('agrees with repeated addition', () => {
        // Catches a `+` where a `*` belongs; quantity 1 cannot distinguish them.
        fc.assert(
            fc.property(realisticPrice(), fc.integer({ min: 0, max: 50 }), (price, count) => {
                const unit = toMinorUnits(price);

                expect(scaleMoney(unit, count)).toBe(
                    addMoney(...Array.from({ length: count }, () => unit))
                );
            }),
            RUN
        );
    });

    it('charges nothing for a line of nothing', () => {
        fc.assert(
            fc.property(anything(), (value) => {
                expect(scaleMoney(toMinorUnits(value), 0)).toBe(NO_MONEY);
            }),
            RUN
        );
    });

    it('stays finite for any count at all', () => {
        fc.assert(
            fc.property(anything(), anything(), (price, count) => {
                expect(Number.isFinite(scaleMoney(toMinorUnits(price), count))).toBe(true);
            }),
            RUN
        );
    });
});

describe('wholeCount', () => {
    it('returns a finite whole number for any input at all', () => {
        fc.assert(
            fc.property(anything(), (value) => {
                expect(Number.isInteger(wholeCount(value))).toBe(true);
            }),
            RUN
        );
    });

    it('leaves a genuine count alone', () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 10_000 }), (count) => {
                expect(wholeCount(count)).toBe(count);
            }),
            RUN
        );
    });
});
