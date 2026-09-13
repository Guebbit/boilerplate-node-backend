/**
 * @module
 * VAT arithmetic for an order: the tax and net amount FROZEN prices resolve to, derived at
 * serialization time the same way `totals.ts` derives `totalPrice` — never stored, never
 * re-resolved against a product's CURRENT tax class. A rate change in config must not restate
 * what a past order was actually charged.
 */

import {
    addMoney,
    apportion,
    scaleMoney,
    scaleMoneyByRate,
    subtractMoney,
    toDecimalAmount,
    toMinorUnits,
    wholeCount,
    type Money,
    NO_MONEY
} from './money';

/** A priced, taxed line — what `orderTaxBreakdown` needs from each order item. */
export interface TaxableLineItem {
    quantity?: unknown;
    /** `unknown` because it is raw aggregate output; `null` is an unpopulated ref. */
    product?: { price?: unknown; taxRate?: unknown } | null;
}

/** One line's VAT figures, as the decimal amounts the contract publishes. */
export interface LineTaxBreakdown {
    taxAmount: number;
    netAmount: number;
}

/** What `orderTaxBreakdown` reports: one entry per line, plus the order-level sums. */
export interface OrderTaxBreakdown {
    /** Same order and length as the `items` given in. */
    lines: LineTaxBreakdown[];
    /** Sum of every line's `netAmount`. */
    netTotal: number;
    /** Sum of every line's `taxAmount`. */
    taxTotal: number;
}

/** An order, as far as its VAT breakdown is concerned. */
export interface OrderTaxInput {
    items: readonly TaxableLineItem[];
    /**
     * The shipping cost frozen at checkout. Delivery carries no rate of its own — it is taxed as
     * ancillary to the goods it delivers — so this is apportioned pro-rata across the lines by
     * their own gross value, then taxed at each line's own rate. `unknown` because it arrives as
     * raw aggregate output; absent on an order that chose no delivery method.
     */
    shippingCost?: unknown;
}

/**
 * The VAT owed on a gross (VAT-inclusive) amount, extracted rather than added on top — VAT_1's
 * decision that `price` is gross. `gross × rate / (1 + rate)` is the standard extraction formula;
 * `scaleMoneyByRate` is where the result actually rounds, half-up, to the nearest minor unit.
 * @param gross - the gross amount that already includes this tax
 * @param rate - the decimal rate `gross` was taxed at
 * @returns the VAT portion of `gross`
 */
const extractTax = (gross: Money, rate: number): Money =>
    rate <= 0 ? NO_MONEY : scaleMoneyByRate(gross, rate / (1 + rate));

/** The rate a line was actually frozen at, or `undefined` on a line that predates VAT. */
const frozenRate = (item: TaxableLineItem): number | undefined =>
    typeof item.product?.taxRate === 'number' ? item.product.taxRate : undefined;

/**
 * Every VAT figure an order's response and invoice need, derived from each line's FROZEN price,
 * quantity and rate, plus shipping's own apportioned share. A single line missing `taxRate` makes
 * the WHOLE order pre-VAT — `undefined`, rather than a partial breakdown that would imply a rate
 * that was never actually charged.
 * @param order - the order's lines and its frozen shipping cost
 * @returns the full breakdown, or `undefined` for a pre-VAT order
 */
export const orderTaxBreakdown = ({
    items,
    shippingCost
}: OrderTaxInput): OrderTaxBreakdown | undefined => {
    const rates = items.map((item) => frozenRate(item));
    if (rates.includes(undefined)) return undefined;

    const grossAmounts = items.map((item) =>
        scaleMoney(toMinorUnits(item.product?.price), wholeCount(item.quantity))
    );
    const shippingShares = apportion(toMinorUnits(shippingCost), grossAmounts);

    let netTotal: Money = NO_MONEY;
    let taxTotal: Money = NO_MONEY;

    const lines = items.map((item, index) => {
        // Every rate was checked present just above — proven, not merely assumed, so `!` applies.
        const rate = rates[index]!;
        const gross = grossAmounts[index];
        const tax = extractTax(gross, rate);
        const net = subtractMoney(gross, tax);
        // Shipping's own apportioned slice, taxed at THIS line's rate — ancillary to the goods.
        const shippingTax = extractTax(shippingShares[index], rate);

        netTotal = addMoney(netTotal, net);
        taxTotal = addMoney(taxTotal, tax, shippingTax);
        return { taxAmount: toDecimalAmount(tax), netAmount: toDecimalAmount(net) };
    });

    return { lines, netTotal: toDecimalAmount(netTotal), taxTotal: toDecimalAmount(taxTotal) };
};
