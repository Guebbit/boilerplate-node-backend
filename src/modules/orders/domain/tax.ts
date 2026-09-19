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

/**
 * One line's VAT figures. `taxAmount`/`netAmount` are the decimal amounts the contract
 * publishes; `grossAmount` is `netAmount + taxAmount`, computed here from the same `Money` values
 * before either rounds — never re-derived by a caller from the two ALREADY-ROUNDED decimals, the
 * way a floating-point sum could drift from what `addMoney`'s minor-unit arithmetic guarantees.
 * Not itself copied onto a serialized order item (`model.ts#applyOrderTax`) — a caller that needs
 * it, like the invoice email, reads it straight off this breakdown.
 */
export interface LineTaxBreakdown {
    taxAmount: number;
    netAmount: number;
    grossAmount: number;
}

/**
 * One VAT rate's slice of the whole order — goods AND shipping combined, since shipping is taxed
 * at each line's own rate rather than carrying one of its own. `grossAmount` is `netAmount +
 * taxAmount`, not re-derived from a price, so it can never drift from the two figures beside it.
 */
export interface TaxRateSummary {
    /** The decimal rate this row is for (`0.22` for 22%) — never repeated across rows. */
    rate: number;
    netAmount: number;
    taxAmount: number;
    grossAmount: number;
}

/** What `orderTaxBreakdown` reports: one entry per line, plus the order-level sums. */
export interface OrderTaxBreakdown {
    /** Same order and length as the `items` given in. */
    lines: LineTaxBreakdown[];
    /** Sum of every line's `netAmount` — goods only, shipping's own net sits in {@link shippingNetAmount}. */
    netTotal: number;
    /** Sum of every line's `taxAmount` PLUS shipping's apportioned tax — the amount actually remitted. */
    taxTotal: number;
    /** Shipping's own net amount, summed across every line it was apportioned onto. */
    shippingNetAmount: number;
    /** Shipping's own tax amount, summed across every line it was apportioned onto. */
    shippingTaxAmount: number;
    /**
     * One row per distinct rate charged on this order, sorted ascending. Reconciles exactly:
     * summed `netAmount` is {@link netTotal} + {@link shippingNetAmount}, summed `taxAmount` is
     * {@link taxTotal}, and summed `grossAmount` is the order's `totalPrice`.
     */
    taxSummary: TaxRateSummary[];
    /**
     * Shipping's OWN slice of {@link taxSummary}, broken out per rate — what lets an invoice print
     * "shipping, taxed at 22%: €4.10 net, €0.90 tax" as its own row instead of folding it silently
     * into the goods total at that rate. Not part of the public contract (`model.ts` does not copy
     * this onto a serialized order): the order response only needs the order-level
     * {@link shippingNetAmount}/{@link shippingTaxAmount} sums, the invoice needs the per-rate
     * detail. Same rates as `taxSummary`, same sort order, but a rate with zero shipping apportioned
     * to it — `shippingCost` absent or zero, or every line at that rate priced at zero, so
     * `apportion` has no positive weight to split onto — is left out rather than printed as an
     * empty row.
     */
    shippingByRate: TaxRateSummary[];
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
 * The VAT owed on a gross (VAT-inclusive) amount, extracted rather than added on top: `price` is
 * always gross. `gross × rate / (1 + rate)` is the standard extraction formula; `scaleMoneyByRate`
 * is where the result actually rounds, half-up, to the nearest minor unit.
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
 * Folds one line's (net, tax) pair into its rate's running total in `byRate` — goods and
 * shipping both call this, which is what lets one row carry both without a second pass.
 * @param byRate - accumulator, mutated in place; one entry per rate seen so far
 * @param rate - the line's own frozen rate, this pair's key
 * @param net - the net amount to fold in
 * @param tax - the tax amount to fold in
 */
const foldIntoRate = (
    byRate: Map<number, { net: Money; tax: Money }>,
    rate: number,
    net: Money,
    tax: Money
): void => {
    const existing = byRate.get(rate) ?? { net: NO_MONEY, tax: NO_MONEY };
    byRate.set(rate, { net: addMoney(existing.net, net), tax: addMoney(existing.tax, tax) });
};

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
    let shippingNetTotal: Money = NO_MONEY;
    let shippingTaxTotal: Money = NO_MONEY;
    const byRate = new Map<number, { net: Money; tax: Money }>();
    const shippingByRateMap = new Map<number, { net: Money; tax: Money }>();

    const lines = items.map((item, index) => {
        // Every rate was checked present just above — proven, not merely assumed, so `!` applies.
        const rate = rates[index]!;
        const gross = grossAmounts[index];
        const tax = extractTax(gross, rate);
        const net = subtractMoney(gross, tax);
        // Shipping's own apportioned slice, taxed at THIS line's rate — ancillary to the goods.
        const shippingGross = shippingShares[index];
        const shippingTax = extractTax(shippingGross, rate);
        const shippingNet = subtractMoney(shippingGross, shippingTax);

        netTotal = addMoney(netTotal, net);
        taxTotal = addMoney(taxTotal, tax, shippingTax);
        shippingNetTotal = addMoney(shippingNetTotal, shippingNet);
        shippingTaxTotal = addMoney(shippingTaxTotal, shippingTax);
        foldIntoRate(byRate, rate, addMoney(net, shippingNet), addMoney(tax, shippingTax));
        foldIntoRate(shippingByRateMap, rate, shippingNet, shippingTax);

        return {
            taxAmount: toDecimalAmount(tax),
            netAmount: toDecimalAmount(net),
            grossAmount: toDecimalAmount(addMoney(net, tax))
        };
    });

    const summaryRowsOf = (source: Map<number, { net: Money; tax: Money }>): TaxRateSummary[] =>
        [...source.entries()]
            .toSorted(([left], [right]) => left - right)
            .map(([rate, { net, tax }]) => ({
                rate,
                netAmount: toDecimalAmount(net),
                taxAmount: toDecimalAmount(tax),
                grossAmount: toDecimalAmount(addMoney(net, tax))
            }));

    return {
        lines,
        netTotal: toDecimalAmount(netTotal),
        taxTotal: toDecimalAmount(taxTotal),
        shippingNetAmount: toDecimalAmount(shippingNetTotal),
        shippingTaxAmount: toDecimalAmount(shippingTaxTotal),
        taxSummary: summaryRowsOf(byRate),
        // A rate whose whole shipping share rounded down to zero — no shipping cost at all, or
        // every line at that rate priced at zero, so `apportion` has no positive weight to split
        // onto — is filtered out rather than printed as an empty row on the invoice.
        shippingByRate: summaryRowsOf(shippingByRateMap).filter(
            (row) => row.netAmount > 0 || row.taxAmount > 0
        )
    };
};
