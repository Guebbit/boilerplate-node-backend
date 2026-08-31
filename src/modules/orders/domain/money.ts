/**
 * @module
 * Money — an amount as a whole number of minor units. The contract publishes decimal
 * `number`/`double`; arithmetic between the boundaries runs in integers so a total stays exact
 * and order-independent. `Money` is a brand, not a class — same integer at runtime, distinct type
 * at compile time — so `toDecimalAmount` is the only way back out.
 *
 * See `docs/theory/tactical-ddd.md` §3.
 */

declare const MONEY_BRAND: unique symbol;

/** An amount in minor units. Never a float. */
export type Money = number & { readonly [MONEY_BRAND]: true };

/** Nothing owed. The identity `addMoney` folds from. */
export const NO_MONEY = 0 as Money;

/** The one constructor: normalises a non-finite result (and `-0`) to `NO_MONEY`. */
const asMoney = (value: number): Money =>
    (Number.isFinite(value) ? (value === 0 ? 0 : value) : 0) as Money;

/**
 * Read a decimal amount as minor units, rounding to the nearest integer. `unknown` because
 * callers get raw aggregate output, where an unpopulated line carries no number at all.
 * @param value - a decimal amount, or anything at all
 * @returns the amount in minor units, rounded to the nearest one
 */
export const toMinorUnits = (value: unknown): Money => asMoney(Math.round(Number(value) * 100));

/**
 * Return an amount as the decimal `number` the contract publishes.
 * @param amount - the amount in minor units
 * @returns the same amount as a decimal, at most two places
 */
export const toDecimalAmount = (amount: Money): number => amount / 100;

/**
 * Add amounts with exact integer addition — no floating-point drift.
 * @param amounts - the amounts to add
 * @returns their sum
 */
export const addMoney = (...amounts: readonly Money[]): Money => {
    let running = NO_MONEY;
    for (const amount of amounts) running = asMoney(running + amount);
    return running;
};

/**
 * Read a quantity as a whole, finite count, defaulting to 0 for anything unusable.
 * @param count - a quantity, or anything at all
 * @returns the nearest whole number, or 0
 */
export const wholeCount = (count: unknown): number => {
    const parsed = Number(count);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

/**
 * Multiply an amount by a whole count — a line price by its quantity.
 * @param amount - the unit amount
 * @param count - how many
 * @returns the amount repeated `count` times
 */
export const scaleMoney = (amount: Money, count: unknown): Money =>
    asMoney(amount * wholeCount(count));
