/**
 * Money — an amount as a whole number of minor units.
 *
 * The contract is unchanged: `openapi.yaml` types every monetary field `number`/`double`. What runs
 * in integers is the arithmetic BETWEEN the boundaries, so a total is exact and order-independent
 * and the rounding rule exists in one file rather than at each site that adds two amounts.
 *
 * A brand rather than a class: the same integer at runtime, a distinct type at compile time. That
 * makes `toDecimalAmount` the only way back to a plain `number`.
 *
 * See `docs/theory/tactical-ddd.md` §3.
 */

declare const MONEY_BRAND: unique symbol;

/** An amount in minor units. Never a float. */
export type Money = number & { readonly [MONEY_BRAND]: true };

/** Nothing owed. The identity `addMoney` folds from. */
export const NO_MONEY = 0 as Money;

/**
 * The one constructor, so a non-finite value cannot exist as an amount at any step.
 *
 * Checked per step rather than once at the end: `Number.MAX_VALUE` is a finite price whose product
 * with a quantity is not, and one `Infinity` term plus one negative term is `NaN`. `-0` is
 * normalised away as a second spelling of an amount with one meaning.
 *
 * @param value - the arithmetic result being claimed as an amount
 * @returns the amount, or `NO_MONEY` when it is not finite
 */
const asMoney = (value: number): Money =>
    (Number.isFinite(value) ? (value === 0 ? 0 : value) : 0) as Money;

/**
 * Read a decimal amount as minor units.
 *
 * Takes `unknown` because the callers have unknown: prices arrive as raw aggregate output, and a
 * line whose product failed to populate carries no number at all. Junk is worth nothing.
 *
 * @param value - a decimal amount, or anything at all
 * @returns the amount in minor units, rounded to the nearest one
 */
export const toMinorUnits = (value: unknown): Money => asMoney(Math.round(Number(value) * 100));

/**
 * Return an amount to the decimal `number` the contract publishes. The single exit.
 *
 * @param amount - the amount in minor units
 * @returns the same amount as a decimal, at most two places
 */
export const toDecimalAmount = (amount: Money): number => amount / 100;

/**
 * Add amounts. Integer addition, so the result is exact however many terms it has.
 *
 * @param amounts - the amounts to add
 * @returns their sum
 */
export const addMoney = (...amounts: readonly Money[]): Money => {
    let running = NO_MONEY;
    for (const amount of amounts) running = asMoney(running + amount);
    return running;
};

/**
 * Read a quantity as a whole, finite count.
 *
 * Exported because a total reports the same count it charged for: `sumLineItems` uses it for both
 * columns, so the two cannot describe different baskets.
 *
 * @param count - a quantity, or anything at all
 * @returns the nearest whole number, or 0
 */
export const wholeCount = (count: unknown): number => {
    const parsed = Number(count);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

/**
 * Multiply an amount by a count — a line price by its quantity.
 *
 * The count is whole, so a fractional quantity cannot reintroduce a fraction of a cent. A shop that
 * sells by weight needs a different function, not a looser version of this one.
 *
 * @param amount - the unit amount
 * @param count - how many
 * @returns the amount repeated `count` times
 */
export const scaleMoney = (amount: Money, count: unknown): Money =>
    asMoney(amount * wholeCount(count));
