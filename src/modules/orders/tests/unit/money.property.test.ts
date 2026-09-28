/**
 * @module
 * Property-based tests — `src/modules/orders/domain/money.ts`. `Money` claims that no monetary
 * arithmetic here can produce `NaN`, `Infinity` or a fraction of a MINOR UNIT, for EVERY input —
 * so the arbitraries are hostile rather than realistic. Seeded, so a failure reproduces; any
 * counterexample found gets written back as an ordinary `it()`. Most cases price in EUR (2
 * decimals, the "cent" the comments below name); the currency's own exponent — 0 for JPY, 3 for
 * KWD — gets its own describe block, since that is this file's actual subject.
 *
 * See `docs/theory/tactical-ddd.md` §3.
 */
import fc from 'fast-check';
import {
    addMoney,
    apportion,
    NO_MONEY,
    scaleMoney,
    scaleMoneyByRate,
    subtractMoney,
    toDecimalAmount,
    toMinorUnits,
    wholeCount,
    type Money
} from '../../domain/money';

/** A literal minor-unit count, branded — `Money` is a brand the module itself never exposes a
 * bare constructor for; these are hand-verified integers, not values a real caller could forge. */
const asMoney = (minorUnits: number): Money => minorUnits as Money;
import { PROPERTY_RUNS } from '@tests/knobs';

/** One seed for the file, and one place to change it; the count is `TEST_PROPERTY_RUNS`. */
const RUN = { seed: 20_260_819, numRuns: PROPERTY_RUNS, endOnFailure: true } as const;

/** The 2-decimal currency every case not specifically about the exponent itself prices in. */
const EUR = 'EUR';

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
                const amount = toMinorUnits(value, EUR);

                expect(Number.isFinite(amount)).toBe(true);
                expect(Number.isInteger(amount)).toBe(true);
            }),
            RUN
        );
    });

    it('treats junk as nothing owed rather than as a number to argue with', () => {
        for (const junk of [undefined, null, 'free', {}, [], Number.NaN, Infinity, -Infinity])
            expect(toMinorUnits(junk, EUR)).toBe(NO_MONEY);
    });

    it('drops an amount whose minor units overflow, rather than carrying an Infinity', () => {
        // `Number.MAX_VALUE` is finite; a hundred times it is not. Checking the input alone misses it.
        expect(toMinorUnits(Number.MAX_VALUE, EUR)).toBe(NO_MONEY);
        expect(toMinorUnits(-Number.MAX_VALUE, EUR)).toBe(NO_MONEY);
    });
});

describe('toMinorUnits ↔ toDecimalAmount', () => {
    it('round-trips a realistic price to the cent', () => {
        fc.assert(
            fc.property(realisticPrice(), (price) => {
                const returned = toDecimalAmount(toMinorUnits(price, EUR), EUR);

                expect(Math.abs(returned - price)).toBeLessThanOrEqual(0.005 + 1e-9);
            }),
            RUN
        );
    });

    it('never returns more than two decimal places', () => {
        // Drift here reaches the wire as a price no invoice can add up.
        fc.assert(
            fc.property(anything(), (value) => {
                const returned = toDecimalAmount(toMinorUnits(value, EUR), EUR);

                expect(Math.abs(Math.round(returned * 100) - returned * 100)).toBeLessThan(1e-6);
            }),
            RUN
        );
    });

    it('is idempotent through a round trip', () => {
        fc.assert(
            fc.property(realisticPrice(), (price) => {
                const once = toDecimalAmount(toMinorUnits(price, EUR), EUR);

                expect(toDecimalAmount(toMinorUnits(once, EUR), EUR)).toBe(once);
            }),
            RUN
        );
    });
});

describe("toMinorUnits/toDecimalAmount — each currency's own minor-unit exponent", () => {
    it('scales by 1 for a 0-decimal currency (JPY) — the yen IS its own minor unit', () => {
        expect(toMinorUnits(1234, 'JPY')).toBe(1234);
        expect(toDecimalAmount(toMinorUnits(1234, 'JPY'), 'JPY')).toBe(1234);
    });

    it('rounds a fractional JPY amount to the nearest whole yen, never a fraction of one', () => {
        expect(toMinorUnits(19.9, 'JPY')).toBe(20);
        expect(toMinorUnits(19.4, 'JPY')).toBe(19);
    });

    it('scales by 1000 for a 3-decimal currency (KWD) — the fils, not the cent', () => {
        expect(toMinorUnits(19.9, 'KWD')).toBe(19_900);
        expect(toDecimalAmount(asMoney(19_900), 'KWD')).toBe(19.9);
    });

    it('never confuses two currencies with different exponents for the same minor-unit count', () => {
        // The exact bug this task exists to fix: the same raw minor-unit integer must decode to a
        // different decimal amount depending on which currency it was counted in.
        const raw = asMoney(1990);

        expect(toDecimalAmount(raw, 'EUR')).toBe(19.9);
        expect(toDecimalAmount(raw, 'JPY')).toBe(1990);
        expect(toDecimalAmount(raw, 'KWD')).toBe(1.99);
    });

    it('caches the resolved exponent — a second call for the same currency agrees with the first', () => {
        // Not observable from the return value alone; this only pins that repeated use of an
        // unusual currency (KWD) keeps answering the SAME exponent, run after run.
        fc.assert(
            fc.property(realisticPrice(), (price) => {
                expect(toMinorUnits(price, 'KWD')).toBe(toMinorUnits(price, 'KWD'));
            }),
            RUN
        );
    });

    it('falls back to 2 decimal places for a currency code Intl cannot resolve', () => {
        // A malformed `NODE_DEFAULT_CURRENCY` is a config mistake this function must survive
        // rather than throw on — `Intl.NumberFormat` itself throws a `RangeError` for this input.
        expect(toMinorUnits(19.9, 'NOT-A-CURRENCY')).toBe(1990);
    });
});

describe('addMoney', () => {
    it('is exact, associative and order-independent', () => {
        // The reason the type exists — float addition is none of these three.
        fc.assert(
            fc.property(fc.array(realisticPrice(), { maxLength: 30 }), (prices) => {
                const amounts = prices.map((price) => toMinorUnits(price, EUR));
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
                expect(Number.isFinite(addMoney(...values.map((v) => toMinorUnits(v, EUR))))).toBe(
                    true
                );
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
                const unit = toMinorUnits(price, EUR);

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
                expect(scaleMoney(toMinorUnits(value, EUR), 0)).toBe(NO_MONEY);
            }),
            RUN
        );
    });

    it('stays finite for any count at all', () => {
        fc.assert(
            fc.property(anything(), anything(), (price, count) => {
                expect(Number.isFinite(scaleMoney(toMinorUnits(price, EUR), count))).toBe(true);
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

/** An arbitrary integer number of minor units — `Money` is a brand, not a constructible type. */
const money = () => fc.integer({ min: 0, max: 10_000_000 }).map((n) => toMinorUnits(n / 100, EUR));

describe('subtractMoney', () => {
    it('is exact integer subtraction', () => {
        fc.assert(
            fc.property(money(), money(), (a, b) => {
                expect(subtractMoney(a, b)).toBe(a - b);
            }),
            RUN
        );
    });

    it('added back to the subtrahend reconstructs the minuend', () => {
        fc.assert(
            fc.property(money(), money(), (a, b) => {
                expect(addMoney(subtractMoney(a, b), b)).toBe(a);
            }),
            RUN
        );
    });
});

describe('scaleMoneyByRate', () => {
    it('returns a finite integer for any rate at all', () => {
        fc.assert(
            fc.property(
                money(),
                fc.double({ noNaN: true, noDefaultInfinity: true, min: -10, max: 10 }),
                (amount, rate) => {
                    const share = scaleMoneyByRate(amount, rate);

                    expect(Number.isFinite(share)).toBe(true);
                    expect(Number.isInteger(share)).toBe(true);
                }
            ),
            RUN
        );
    });

    it('charges nothing at a zero rate, and the whole amount at a rate of 1', () => {
        fc.assert(
            fc.property(money(), (amount) => {
                expect(scaleMoneyByRate(amount, 0)).toBe(NO_MONEY);
                expect(scaleMoneyByRate(amount, 1)).toBe(amount);
            }),
            RUN
        );
    });

    it('is exact on a value known to be float-imprecise: 19.90 in cents times 0.22/1.22', () => {
        // `19.9 * 100 === 1989.9999999999998` — the exact float dust VAT.md flags. `toMinorUnits`
        // already rounds it away; this confirms a SECOND multiply (the rate) on the result stays
        // exact too, rather than compounding the imprecision into an off-by-one cent.
        const gross = toMinorUnits(19.9, EUR);
        expect(gross).toBe(1990);
        expect(scaleMoneyByRate(gross, 0.22 / 1.22)).toBe(359);
    });
});

describe('apportion', () => {
    it('always sums exactly to the total, for any split at all', () => {
        fc.assert(
            fc.property(
                money(),
                fc.array(money(), { minLength: 1, maxLength: 20 }),
                (total, weights) => {
                    const shares = apportion(total, weights);

                    expect(addMoney(...shares)).toBe(total);
                    expect(shares).toHaveLength(weights.length);
                }
            ),
            RUN
        );
    });

    it('never produces a negative share for a non-negative total and weights', () => {
        fc.assert(
            fc.property(money(), fc.array(money(), { maxLength: 20 }), (total, weights) => {
                for (const share of apportion(total, weights))
                    expect(share).toBeGreaterThanOrEqual(0);
            }),
            RUN
        );
    });

    it('splits evenly when it divides evenly', () => {
        const equalWeights = [toMinorUnits(1, EUR), toMinorUnits(1, EUR), toMinorUnits(1, EUR)];
        expect(apportion(toMinorUnits(3, EUR), equalWeights)).toEqual([100, 100, 100]);
    });

    it('gives the whole remainder to the single largest weight on an uneven split', () => {
        // 100 cents split 2:1 is 66.67/33.33 before rounding — floor gives 66/33, remainder 1
        // goes to the larger share.
        const shares = apportion(toMinorUnits(1, EUR), [
            toMinorUnits(2, EUR),
            toMinorUnits(1, EUR)
        ]);
        expect(shares).toEqual([67, 33]);
    });

    it('gives the whole amount to a single weight', () => {
        expect(apportion(toMinorUnits(1, EUR), [toMinorUnits(1, EUR)])).toEqual([100]);
    });

    it('assigns every leftover cent to the same largest weight when there are more lines than cents', () => {
        // 1 cent split across 3 equal lines: each floors to 0, and the single leftover cent goes
        // to the first of the tied-largest weights — never split further, never dropped.
        const equalWeights = [toMinorUnits(1, EUR), toMinorUnits(1, EUR), toMinorUnits(1, EUR)];
        expect(apportion(toMinorUnits(0.01, EUR), equalWeights)).toEqual([1, 0, 0]);
    });

    it('returns all-zero shares when every weight is zero, rather than dividing by zero', () => {
        const zeroWeights = [NO_MONEY, NO_MONEY, NO_MONEY];
        expect(apportion(toMinorUnits(10, EUR), zeroWeights)).toEqual([0, 0, 0]);
    });

    it('returns an empty split for no weights at all', () => {
        expect(apportion(toMinorUnits(10, EUR), [])).toEqual([]);
    });
});
