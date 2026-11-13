/**
 * @module
 * Money — an amount as a whole number of minor units. The contract publishes decimal
 * strings at the currency's places; arithmetic between the boundaries runs in integers so a total stays exact
 * and order-independent. `Money` is a brand, not a class — same integer at runtime, distinct type
 * at compile time — so `toDecimalString` is the only way back out.
 *
 * A currency's minor unit is NOT always a hundredth: JPY/KRW have none (the yen IS its own minor
 * unit), KWD/BHD have a thousandth (the fils). The exponents are ISO 4217's, pinned below.
 * {@link toMinorUnits}/{@link toDecimalString} both take the currency they're converting FOR, so a
 * caller working in JPY never multiplies by 100 where it should multiply by 1 — see Fowler's Money pattern, or Stripe's own "zero-decimal
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
 * at least AFN ALL COP HUF IDR IQD IRR KPW LAK LBP MGA MMK PKR SOS SYP YER, where ISO 4217 says 2
 * (3 for IQD).
 * https://www.six-group.com/en/products-services/financial-information/data-standards.html
 *
 * Exponent 2 is the rule; the other three lists are the exceptions. Codes are listed under the
 * exponent ISO publishes for them.
 *
 * Table source: SIX List One, published 2026-09-17.
 *
 * Funds codes: CLF, UYI and UYW are listed; no others are added.
 * Withdrawn codes (ANG, BGN, HRK, ...) are absent, so {@link isIso4217Code} refuses them.
 */
const ISO_4217_EXPONENTS: Readonly<Record<string, number>> = Object.fromEntries(
    (
        [
            [0, 'BIF CLP DJF GNF ISK JPY KMF KRW PYG RWF UGX UYI VND VUV XAF XOF XPF'],
            [3, 'BHD IQD JOD KWD LYD OMR TND'],
            [4, 'CLF UYW'],
            [
                2,
                `AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BMD BND BOB BRL BSD BTN BWP
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
 * Whether a code is in the pinned ISO 4217 table. A table lookup, not {@link minorUnitExponent}:
 * that one falls back to 2 for any code and would accept everything.
 * @param code - an upper-case code
 * @returns true when the table lists it
 */
export const isIso4217Code = (code: string): boolean => code in ISO_4217_EXPONENTS;

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
 * callers get raw aggregate output, where an unpopulated field carries no number at all.
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
 * Spell an amount as the wire does: plain decimal text at exactly the currency's places —
 * `"19.90"` EUR, `"1000"` JPY, `"1.500"` KWD. The digits are moved, never divided, so no float
 * is involved and two equal amounts are equal strings.
 * @param amount - the amount in minor units
 * @param currency - the ISO-4217 code `amount` is priced in — decides the places
 * @returns the amount as padded decimal text, with a leading `-` when negative
 */
export const toDecimalString = (amount: Money, currency: string): string => {
    const exponent = minorUnitExponent(currency);
    // BigInt spells an integer double in full: `String(1e21)` would switch to exponent notation.
    const digits = BigInt(Math.abs(amount))
        .toString()
        .padStart(exponent + 1, '0');
    const whole = digits.slice(0, digits.length - exponent);
    const text = exponent === 0 ? whole : `${whole}.${digits.slice(digits.length - exponent)}`;
    return amount < 0 ? `-${text}` : text;
};

/**
 * Re-spell any amount at exactly the currency's places: `"19.9"` or `19.9` become `"19.90"`, a
 * stored `Decimal128` that lost its trailing zeros gets them back. Past the places it rounds.
 * @param value - an amount as text or number (anything else reads as nothing)
 * @param currency - the ISO-4217 code the amount is priced in
 * @returns the amount as padded decimal text
 */
export const padDecimal = (value: unknown, currency: string): string =>
    toDecimalString(toMinorUnits(value, currency), currency);

/**
 * An amount spelled the way a locale writes money, with the places taken from the pinned ISO 4217
 * table rather than the runtime's own CLDR data, so a mail and the ledger agree on the scale.
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
 * @param locale - the reader's language
 * @param amount - a decimal amount as text (or a number) in `currency`
 * @param currency - an ISO-4217 code
 * @returns the formatted string, e.g. `€19.99`
 */
export const formatMoney = (locale: string, amount: string | number, currency: string): string => {
    const digits = minorUnitExponent(currency);
    // `format` reads a numeric string exactly, with no float in between; the lib typings only
    // admit `number | bigint` here, hence the one cast.
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
        // `Intl.NumberFormat.format` takes a `number | bigint`; a branded `Money` is a number at
        // runtime.
    }).format(amount as number);
};

/**
 * Whether a decimal amount has no more places than the currency's minor unit: `"19.99"` EUR does,
 * `"19.999"` EUR and `"100.5"` JPY do not. Trailing zeros past the unit do not count (`"19.990"` is
 * 19.99). The check that keeps what is stored equal to what is charged.
 * @param amount - a decimal amount as plain text
 * @param currency - the ISO-4217 code `amount` is priced in
 * @returns true when `amount` is plain decimal text with no value past the currency's places
 */
export const fitsCurrency = (amount: string, currency: string): boolean => {
    const match = PLAIN_DECIMAL.exec(amount);
    if (!match) return false;
    const fraction = match.at(3) ?? ''; // group 3 is absent for a whole number
    return fraction.slice(minorUnitExponent(currency)).replaceAll('0', '') === '';
};

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
 * The smallest of some amounts — an amount capped at a limit.
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
 * Multiply an amount by a whole count.
 * @param amount - the unit amount
 * @param count - how many
 * @returns the amount repeated `count` times
 */
export const scaleMoney = (amount: Money, count: unknown): Money =>
    asMoney(amount * wholeCount(count));

/**
 * An amount shared evenly over a count, rounded half-up to the nearest minor unit — an
 * average. Nothing over a count of zero: 0 rather than a division by nothing.
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
 * Take a fractional share of an amount — a percentage rate applied to it. Unlike
 * {@link scaleMoney} (an exact whole-count repeat), a rate multiply is inherently fractional, so
 * this is the one place a rate multiply rounds: half-up, to the nearest minor unit.
 *
 * Half-up rounds a negative result TOWARD +∞ (`Math.round(-0.5) === -0`, not `-1`) — harmless
 * today, since every amount passed in is `min: 0`. Revisit this the day a share of a negative
 * amount is needed.
 * @param amount - the amount to take a share of
 * @param rate - the share, as a decimal (0.22 for 22%)
 * @returns the share, rounded to the nearest minor unit
 */
export const scaleMoneyByRate = (amount: Money, rate: number): Money =>
    asMoney(Math.round(amount * rate));

/**
 * Splits an integer amount pro-rata across a set of weights (e.g. each part's own value), so the parts always sum EXACTLY to `total` — the one thing a plain division can't
 * promise once cents don't divide evenly. Flooring every share first guarantees no share
 * overshoots; the leftover unit(s) that flooring leaves behind go to the LARGEST weight — the
 * conventional choice — rather than an arbitrary one, or a share that silently vanishes.
 *
 * All weights zero (nothing to apportion onto) returns all-zero shares rather than dividing by
 * zero — there is no meaningful split of an amount across weights that are themselves zero.
 * @param total - the amount to split, in minor units
 * @param weights - each recipient's share weight, in the same units — e.g. a part's own value
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
