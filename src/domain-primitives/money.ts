/**
 * @module
 * Money — an amount as a whole number of minor units. The contract publishes decimal
 * `number`/`double`; arithmetic between the boundaries runs in integers so a total stays exact
 * and order-independent. `Money` is a brand, not a class — same integer at runtime, distinct type
 * at compile time — so `toDecimalAmount` is the only way back out.
 *
 * A currency's minor unit is NOT always a hundredth: JPY/KRW have none (the yen IS its own minor
 * unit), KWD/BHD have a thousandth (the fils). The exponents are ISO 4217's, pinned below.
 * {@link toMinorUnits}/{@link toDecimalAmount} both take the currency they're converting FOR, so a caller pricing a JPY order never multiplies by
 * 100 where it should multiply by 1 — see Fowler's Money pattern, or Stripe's own "zero-decimal
 * currencies" table for the same rule under a different name.
 *
 * See `docs/theory/tactical-ddd.md` §3.
 */

/** Type-only brand: a `unique symbol` that exists for the compiler, never at runtime. */
declare const MONEY_BRAND: unique symbol;

/** An amount in minor units. Never a float. */
export type Money = number & { readonly [MONEY_BRAND]: true };

/** Nothing owed. The identity `addMoney` folds from. */
export const NO_MONEY = 0 as Money;

/** The one constructor: normalises a non-finite result (and `-0`) to `NO_MONEY`. */
const asMoney = (value: number): Money =>
    (Number.isFinite(value) ? (value === 0 ? 0 : value) : 0) as Money;

/**
 * ISO 4217 minor-unit exponents, pinned in-repo. A currency's exponent decides how a stored
 * amount is read, so it must not follow a runtime's display table: `Intl` (CLDR) answers 0 for
 * HUF, IDR, COP, PKR, LBP and IQD, where ISO 4217 says 2, 2, 2, 2, 2 and 3.
 * https://www.six-group.com/en/products-services/financial-information/data-standards.html
 *
 * Exponent 2 is the rule; the other three lists are the exceptions. Codes are listed under the
 * exponent ISO publishes for them.
 */
const ISO_4217_EXPONENTS: Readonly<Record<string, number>> = Object.fromEntries(
    (
        [
            [0, 'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF'],
            [3, 'BHD IQD JOD KWD LYD OMR TND'],
            [4, 'CLF UYW'],
            [
                2,
                `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BMD BND BOB BRL BSD BTN BWP
                BYN BZD CAD CDF CHF CNY COP CRC CUP CVE CZK DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP
                GEL GHS GIP GMD GTQ GYD HKD HNL HTG HUF IDR ILS INR IRR JMD KES KGS KHR KPW KYD KZT
                LAK LBP LKR LRD LSL MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN
                NIO NOK NPR NZD PAB PEN PGK PHP PKR PLN QAR RON RSD RUB SAR SBD SCR SDG SEK SGD SHP
                SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TOP TRY TTD TWD TZS UAH USD UYU UZS VED
                VES WST XCD XCG YER ZAR ZMW ZWG`
            ]
        ] as const
    ).flatMap(([exponent, codes]) => codes.split(/\s+/).map((code) => [code, exponent] as const))
);

/**
 * How many decimal places a currency's minor unit represents — 2 for EUR/USD, 0 for JPY/KRW, 3
 * for KWD/BHD — read from the pinned {@link ISO_4217_EXPONENTS} table. A code the table does not
 * list gets 2, the rule the standard itself follows for almost every currency.
 * @param currency - an ISO-4217 code
 * @returns the number of decimal places that currency's minor unit represents
 */
export const minorUnitExponent = (currency: string): number => ISO_4217_EXPONENTS[currency] ?? 2;

/**
 * The plain decimal notation a stored amount arrives in when it is read as text — a `Decimal128`
 * prints this way, and so does a string. Anything else (exponent form, junk) takes the numeric path.
 */
const PLAIN_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Read plain decimal text as minor units by moving the digits, never by multiplying a float.
 * Digits beyond the exponent round half-up on the first dropped digit.
 * @param match - the {@link PLAIN_DECIMAL} match of the text
 * @param exponent - the currency's decimal places
 * @returns the minor units, as a plain number
 */
const minorUnitsOfText = (match: RegExpExecArray, exponent: number): number => {
    const [, sign, whole, fraction = ''] = match;
    const scaled = Number(whole + fraction.padEnd(exponent, '0').slice(0, exponent));
    const roundsUp = Number(fraction.charAt(exponent) || '0') >= 5;
    return (sign === '-' ? -1 : 1) * (scaled + (roundsUp ? 1 : 0));
};

/**
 * Read a decimal amount as minor units, rounding to the nearest integer. `unknown` because
 * callers get raw aggregate output, where an unpopulated line carries no number at all.
 *
 * A `Decimal128` (or a numeric string) is read digit by digit, so a stored amount goes to minor
 * units without a float in between; a `number` is multiplied and rounded.
 * @param value - a decimal amount, or anything at all
 * @param currency - the ISO-4217 code `value` is priced in — decides the scale factor
 * @returns the amount in minor units, rounded to the nearest one
 */
export const toMinorUnits = (value: unknown, currency: string): Money => {
    const exponent = minorUnitExponent(currency);
    const match = typeof value === 'number' ? null : PLAIN_DECIMAL.exec(String(value));
    return asMoney(
        match ? minorUnitsOfText(match, exponent) : Math.round(Number(value) * 10 ** exponent)
    );
};

/**
 * Return an amount as the decimal `number` the contract publishes.
 * @param amount - the amount in minor units
 * @param currency - the ISO-4217 code `amount` is priced in — decides the scale factor
 * @returns the same amount as a decimal, at most `currency`'s own number of places
 */
export const toDecimalAmount = (amount: Money, currency: string): number =>
    amount / 10 ** minorUnitExponent(currency);

/**
 * An amount spelled the way a locale writes money, with the places taken from the pinned ISO 4217
 * table rather than the runtime's own CLDR data, so a mail and the ledger agree on the scale.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 * @param locale - the reader's language
 * @param amount - a decimal in `currency`
 * @param currency - an ISO-4217 code
 * @returns the formatted string, e.g. `€19.99`
 */
export const formatMoney = (locale: string, amount: number, currency: string): string => {
    const digits = minorUnitExponent(currency);
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(amount);
};

/**
 * Whether a decimal amount has no more places than the currency's minor unit — 19.99 EUR does,
 * 19.999 EUR and 100.5 JPY do not. The check that keeps what is stored equal to what is charged.
 * @param amount - a decimal amount
 * @param currency - the ISO-4217 code `amount` is priced in
 * @returns true when `amount` survives a trip through minor units unchanged
 */
export const fitsCurrency = (amount: number, currency: string): boolean =>
    Number.isFinite(amount) && toDecimalAmount(toMinorUnits(amount, currency), currency) === amount;

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
 * The smallest of some amounts — a refund capped at what is left to refund.
 * @param first - one amount
 * @param rest - the others
 * @returns the smallest
 */
export const minMoney = (first: Money, ...rest: readonly Money[]): Money =>
    asMoney(Math.min(first, ...rest));

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
 * An amount shared evenly over a count, rounded half-up to the nearest minor unit — an average order
 * value. Nothing over zero orders: 0 rather than a division by nothing.
 * @param amount - the total
 * @param count - how many it is shared over
 * @returns `amount / count` rounded, or `NO_MONEY` when `count` is not positive
 */
export const averageMoney = (amount: Money, count: number): Money =>
    count > 0 ? asMoney(Math.round(amount / count)) : NO_MONEY;

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
