/**
 * @module
 * Money — an amount as a whole number of minor units. The contract publishes decimal
 * `number`/`double`; arithmetic between the boundaries runs in integers so a total stays exact
 * and order-independent. `Money` is a brand, not a class — same integer at runtime, distinct type
 * at compile time — so `toDecimalAmount` is the only way back out.
 *
 * A currency's minor unit is NOT always a hundredth: JPY/KRW have none (the yen IS its own minor
 * unit), KWD/BHD have a thousandth (the fils). {@link toMinorUnits}/{@link toDecimalAmount} both
 * take the currency they're converting FOR, so a caller pricing a JPY order never multiplies by
 * 100 where it should multiply by 1 — see Fowler's Money pattern, or Stripe's own "zero-decimal
 * currencies" table for the same rule under a different name.
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
 * How many decimal places a currency's minor unit represents — 2 for EUR/USD, 0 for JPY/KRW, 3
 * for KWD/BHD. Cached per code: constructing an `Intl.NumberFormat` is real work, and this runs on
 * every money conversion.
 *
 * `Intl.NumberFormat` throws a `RangeError` for a currency code it doesn't recognise — a
 * synchronous throw from a call we don't own, so a `try`/`catch` guards it rather than one more
 * validation this module would have to keep in step with ISO 4217 by hand. `NODE_DEFAULT_CURRENCY`
 * and an order's own frozen `currency` are both plain strings, never checked against the standard
 * at the point they're set — 2 is `Intl`'s own default for a style it otherwise can't resolve.
 * https://tc39.es/ecma402/#sec-currencydigits
 */
const minorUnitExponentCache = new Map<string, number>();

/**
 * @param currency - an ISO-4217 code
 * @returns the number of decimal places that currency's minor unit represents
 */
const minorUnitExponent = (currency: string): number => {
    const cached = minorUnitExponentCache.get(currency);
    if (cached !== undefined) return cached;

    let exponent = 2;
    // `Intl.NumberFormat` throws a `RangeError` for a currency code it doesn't recognise; there
    // is no verdict-returning way to ask it first, and a malformed `NODE_DEFAULT_CURRENCY` must
    // fall back to 2, not crash the process that reads it.
    // eslint-disable-next-line no-restricted-syntax -- contains exactly that RangeError, see above
    try {
        // `maximumFractionDigits` is typed optional (some `style`s never set it) though the spec
        // guarantees `'currency'` always does — the `?? 2` is TypeScript's own requirement, not a
        // second fallback this code path can actually reach.
        exponent =
            new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
                .maximumFractionDigits ?? 2;
    } catch {
        // Stryker disable next-line -- an unrecognised currency code is a config mistake, not a
        // branch this suite drives; the fallback above already covers it.
    }

    minorUnitExponentCache.set(currency, exponent);
    return exponent;
};

/**
 * Read a decimal amount as minor units, rounding to the nearest integer. `unknown` because
 * callers get raw aggregate output, where an unpopulated line carries no number at all.
 * @param value - a decimal amount, or anything at all
 * @param currency - the ISO-4217 code `value` is priced in — decides the scale factor
 * @returns the amount in minor units, rounded to the nearest one
 */
export const toMinorUnits = (value: unknown, currency: string): Money =>
    asMoney(Math.round(Number(value) * 10 ** minorUnitExponent(currency)));

/**
 * Return an amount as the decimal `number` the contract publishes.
 * @param amount - the amount in minor units
 * @param currency - the ISO-4217 code `amount` is priced in — decides the scale factor
 * @returns the same amount as a decimal, at most `currency`'s own number of places
 */
export const toDecimalAmount = (amount: Money, currency: string): number =>
    amount / 10 ** minorUnitExponent(currency);

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

/**
 * Subtract one amount from another — exact integer subtraction, same reasoning as {@link addMoney}.
 * @param minuend - the starting amount
 * @param subtrahend - the amount to take away
 * @returns `minuend - subtrahend`
 */
export const subtractMoney = (minuend: Money, subtrahend: Money): Money =>
    asMoney(minuend - subtrahend);

/**
 * Take a fractional share of an amount — a tax rate applied to a gross or net figure. Unlike
 * {@link scaleMoney} (an exact whole-count repeat), a rate multiply is inherently fractional, so
 * this is the one place VAT arithmetic rounds: half-up, to the nearest minor unit.
 *
 * Half-up rounds a negative result TOWARD +∞ (`Math.round(-0.5) === -0`, not `-1`) — harmless
 * today, since every amount here is `min: 0` and there are no refunds. Revisit this the day a
 * credit note needs to take a share of a negative amount.
 * @param amount - the amount to take a share of
 * @param rate - the share, as a decimal (0.22 for 22%)
 * @returns the share, rounded to the nearest minor unit
 */
export const scaleMoneyByRate = (amount: Money, rate: number): Money =>
    asMoney(Math.round(amount * rate));

/**
 * Splits an integer amount pro-rata across a set of weights (e.g. each order line's own gross
 * value), so the parts always sum EXACTLY to `total` — the one thing a plain division can't
 * promise once cents don't divide evenly. Flooring every share first guarantees no share
 * overshoots; the leftover unit(s) that flooring leaves behind go to the LARGEST weight — the
 * conventional choice — rather than an arbitrary one, or a share that silently vanishes.
 *
 * All weights zero (nothing to apportion onto) returns all-zero shares rather than dividing by
 * zero — there is no meaningful split of a shipping charge across lines that are themselves free.
 * @param total - the amount to split, in minor units
 * @param weights - each recipient's share weight, in the same units — e.g. a line's own gross value
 * @returns one share per weight, in the same order, summing exactly to `total`
 */
export const apportion = (total: Money, weights: readonly Money[]): Money[] => {
    const totalWeight = addMoney(...weights);
    if (totalWeight === NO_MONEY) return weights.map(() => NO_MONEY);

    const shares = weights.map((weight) => asMoney(Math.floor((total * weight) / totalWeight)));
    const remainder = subtractMoney(total, addMoney(...shares));
    if (remainder === NO_MONEY) return shares;

    // The largest weight absorbs the rounding remainder — first one found on a tie, deterministically.
    let largestIndex = 0;
    for (const [index, weight] of weights.entries())
        if (weight > weights[largestIndex]) largestIndex = index;

    shares[largestIndex] = addMoney(shares[largestIndex], remainder);
    return shares;
};
