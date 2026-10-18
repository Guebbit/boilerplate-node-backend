/**
 * @module
 * The sales figures, from the money and counts the owning modules hand back. Pure and in minor
 * units until the last step, so a sum of buckets equals the sum of the whole.
 *
 * Definitions (Shopify's names; the sale date and "paid orders only" are WooCommerce's): see
 * `docs/modules/stats.md#definitions`.
 */

import {
    NO_MONEY,
    addMoney,
    averageMoney,
    subtractMoney,
    toDecimalAmount,
    type Money
} from '@domain-primitives/money';

/** What one bucket of one currency adds up to, before any figure is derived. */
export interface RawFigures {
    orders: number;
    unitsOrdered: number;
    unitsReversed: number;
    invoicedGoods: Money;
    invoicedShipping: Money;
    invoicedTax: Money;
    invoicedGross: Money;
    creditedGoods: Money;
    creditedShipping: Money;
    creditedTax: Money;
    creditedGross: Money;
}

/** The figures the contract publishes, in decimals. */
export interface Figures {
    orders: number;
    unitsOrdered: number;
    unitsReversed: number;
    netUnits: number;
    grossSales: number;
    discounts: number;
    reversals: number;
    netSales: number;
    shipping: number;
    taxes: number;
    totalSales: number;
    refunds: number;
    averageOrderValue: number;
}

/** Nothing sold. */
export const emptyRawFigures = (): RawFigures => ({
    orders: 0,
    unitsOrdered: 0,
    unitsReversed: 0,
    invoicedGoods: NO_MONEY,
    invoicedShipping: NO_MONEY,
    invoicedTax: NO_MONEY,
    invoicedGross: NO_MONEY,
    creditedGoods: NO_MONEY,
    creditedShipping: NO_MONEY,
    creditedTax: NO_MONEY,
    creditedGross: NO_MONEY
});

/**
 * Two raw figures added field by field.
 * @param a - one
 * @param b - the other
 */
export const addRawFigures = (a: RawFigures, b: RawFigures): RawFigures => ({
    orders: a.orders + b.orders,
    unitsOrdered: a.unitsOrdered + b.unitsOrdered,
    unitsReversed: a.unitsReversed + b.unitsReversed,
    invoicedGoods: addMoney(a.invoicedGoods, b.invoicedGoods),
    invoicedShipping: addMoney(a.invoicedShipping, b.invoicedShipping),
    invoicedTax: addMoney(a.invoicedTax, b.invoicedTax),
    invoicedGross: addMoney(a.invoicedGross, b.invoicedGross),
    creditedGoods: addMoney(a.creditedGoods, b.creditedGoods),
    creditedShipping: addMoney(a.creditedShipping, b.creditedShipping),
    creditedTax: addMoney(a.creditedTax, b.creditedTax),
    creditedGross: addMoney(a.creditedGross, b.creditedGross)
});

/**
 * Derive the published figures.
 *
 * Net sales is gross minus reversals (no discount exists yet, so that term is 0); total sales is
 * net plus shipping plus taxes; average order value is the gross over the order count.
 *
 * @param raw - the sums
 * @param currency - the ISO-4217 code every amount is in, which decides the decimal places
 */
export const figuresOf = (raw: RawFigures, currency: string): Figures => {
    const netSales = subtractMoney(raw.invoicedGoods, raw.creditedGoods);
    const shipping = subtractMoney(raw.invoicedShipping, raw.creditedShipping);
    const taxes = subtractMoney(raw.invoicedTax, raw.creditedTax);
    return {
        orders: raw.orders,
        unitsOrdered: raw.unitsOrdered,
        unitsReversed: raw.unitsReversed,
        netUnits: raw.unitsOrdered - raw.unitsReversed,
        grossSales: toDecimalAmount(raw.invoicedGoods, currency),
        discounts: 0,
        reversals: toDecimalAmount(raw.creditedGoods, currency),
        netSales: toDecimalAmount(netSales, currency),
        shipping: toDecimalAmount(shipping, currency),
        taxes: toDecimalAmount(taxes, currency),
        totalSales: toDecimalAmount(addMoney(netSales, shipping, taxes), currency),
        refunds: toDecimalAmount(raw.creditedGross, currency),
        averageOrderValue: toDecimalAmount(averageMoney(raw.invoicedGoods, raw.orders), currency)
    };
};

/**
 * A share, guarded against an empty denominator.
 * @param part - the numerator
 * @param whole - the denominator
 * @returns `part / whole`, or 0 when there is no whole
 */
export const rateOf = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);
