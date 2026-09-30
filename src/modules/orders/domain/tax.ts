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
import { isShippedItem } from './rules';

/** A priced, taxed line — what `orderTaxBreakdown` needs from each order item. */
export interface TaxableLineItem {
    quantity?: unknown;
    /** `unknown` because it is raw aggregate output; `null` is an unpopulated ref. */
    product?: { price?: unknown; taxRate?: unknown; requiresShipping?: unknown } | null;
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
    /**
     * Same order and length as the `items` given in. A line's tax is its share of its RATE's one
     * rounded figure (see `groupByRate`), so a rate's lines sum exactly to that rate's row.
     */
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
    /** The ISO-4217 code this order is priced in — the order's own frozen currency. */
    currency: string;
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

/**
 * The rate a line was actually frozen at, coerced from raw aggregate output — same defensive
 * coercion `wholeCount`/`toMinorUnits` already apply to `quantity`/`price`, defaulting to 0 for
 * anything that isn't a usable number rather than trusting the aggregation pipeline blindly.
 */
const frozenRate = (item: TaxableLineItem): number => {
    const rate = Number(item.product?.taxRate);
    return Number.isFinite(rate) ? rate : 0;
};

/** One VAT rate's goods and shipping gross, and the tax rounded ONCE across both. */
interface RateGroup {
    goodsGross: Money;
    shippingGross: Money;
    tax: Money;
    goodsTax: Money;
    shippingTax: Money;
}

/**
 * Groups gross amounts by rate and extracts each rate's VAT ONCE, from the rate's whole taxable
 * total — goods and shipping together (EN 16931 BR-CO-17: VAT is rate x taxable amount per rate,
 * rounded once, never a sum of per-line rounded amounts). The rounded tax is then split between
 * goods and shipping by `apportion`, so the two parts always sum to it exactly.
 * @param grossByLine - each line's gross goods amount
 * @param shippingByLine - each line's apportioned gross shipping share
 * @param rates - each line's own frozen rate
 * @returns one group per distinct rate
 */
const groupByRate = (
    grossByLine: readonly Money[],
    shippingByLine: readonly Money[],
    rates: readonly number[]
): Map<number, RateGroup> => {
    const groups = new Map<number, RateGroup>();
    for (const [index, rate] of rates.entries()) {
        const current = groups.get(rate);
        const goodsGross = addMoney(current?.goodsGross ?? NO_MONEY, grossByLine[index]);
        const shippingGross = addMoney(current?.shippingGross ?? NO_MONEY, shippingByLine[index]);
        groups.set(rate, {
            goodsGross,
            shippingGross,
            tax: NO_MONEY,
            goodsTax: NO_MONEY,
            shippingTax: NO_MONEY
        });
    }
    for (const [rate, group] of groups) {
        const tax = extractTax(addMoney(group.goodsGross, group.shippingGross), rate);
        const [goodsTax, shippingTax] = apportion(tax, [group.goodsGross, group.shippingGross]);
        groups.set(rate, { ...group, tax, goodsTax, shippingTax });
    }
    return groups;
};

/**
 * Spreads each rate's goods VAT over the lines carrying that rate, pro-rata by gross value, so a
 * rate's line taxes sum EXACTLY to its one rounded figure.
 * @param grossByLine - each line's gross goods amount
 * @param rates - each line's own frozen rate
 * @param goodsTaxByRate - the goods VAT owed at each rate
 * @returns one tax amount per line, in line order
 */
const allocateLineTax = (
    grossByLine: readonly Money[],
    rates: readonly number[],
    goodsTaxByRate: ReadonlyMap<number, Money>
): Money[] => {
    const taxes = grossByLine.map(() => NO_MONEY);
    for (const [rate, goodsTax] of goodsTaxByRate) {
        const indexes = rates.flatMap((lineRate, index) => (lineRate === rate ? [index] : []));
        const shares = apportion(
            goodsTax,
            indexes.map((index) => grossByLine[index])
        );
        for (const [position, index] of indexes.entries()) taxes[index] = shares[position];
    }
    return taxes;
};

/**
 * Per-line VAT for lines whose per-rate goods VAT is already frozen — how an issued document
 * re-derives each printed line without the shipping it no longer carries per line.
 * @param items - the document's lines
 * @param currency - the ISO-4217 code the amounts are in
 * @param goodsTaxByRate - the frozen goods VAT at each rate, a decimal
 * @returns one figure set per line, in line order; net + tax is exactly the line's gross
 */
export const lineTaxFromRateTotals = (
    items: readonly TaxableLineItem[],
    currency: string,
    goodsTaxByRate: ReadonlyMap<number, number>
): LineTaxBreakdown[] => {
    const rates = items.map((item) => frozenRate(item));
    const grossByLine = items.map((item) =>
        scaleMoney(toMinorUnits(item.product?.price, currency), wholeCount(item.quantity))
    );
    const taxes = allocateLineTax(
        grossByLine,
        rates,
        new Map([...goodsTaxByRate].map(([rate, tax]) => [rate, toMinorUnits(tax, currency)]))
    );
    return grossByLine.map((gross, index) => ({
        taxAmount: toDecimalAmount(taxes[index], currency),
        netAmount: toDecimalAmount(subtractMoney(gross, taxes[index]), currency),
        grossAmount: toDecimalAmount(gross, currency)
    }));
};

/**
 * Every VAT figure an order's response and invoice need, derived from each line's FROZEN price,
 * quantity and rate, plus shipping's own apportioned share.
 * @param order - the order's lines, its frozen shipping cost, and the currency both are priced in
 * @returns the full breakdown
 */
export const orderTaxBreakdown = ({
    items,
    shippingCost,
    currency
}: OrderTaxInput): OrderTaxBreakdown => {
    const rates = items.map((item) => frozenRate(item));

    const grossAmounts = items.map((item) =>
        scaleMoney(toMinorUnits(item.product?.price, currency), wholeCount(item.quantity))
    );
    // Shipping is ancillary to the goods it delivers (see the module docblock) — a digital line
    // carries none of it, so its weight in the apportionment is zero rather than its gross value.
    const shippingWeights = items.map((item, index) =>
        isShippedItem(item) ? grossAmounts[index] : NO_MONEY
    );
    const shippingShares = apportion(toMinorUnits(shippingCost, currency), shippingWeights);

    const groups = groupByRate(grossAmounts, shippingShares, rates);
    const lineTaxes = allocateLineTax(
        grossAmounts,
        rates,
        new Map([...groups].map(([rate, group]) => [rate, group.goodsTax]))
    );

    const lines = items.map((item, index) => ({
        taxAmount: toDecimalAmount(lineTaxes[index], currency),
        netAmount: toDecimalAmount(subtractMoney(grossAmounts[index], lineTaxes[index]), currency),
        grossAmount: toDecimalAmount(grossAmounts[index], currency)
    }));

    const sortedGroups = [...groups.entries()].toSorted(([left], [right]) => left - right);
    const sumOf = (pick: (group: RateGroup) => Money): Money =>
        addMoney(...sortedGroups.map(([, group]) => pick(group)));

    const netOf = (gross: Money, tax: Money) => subtractMoney(gross, tax);
    const rowOf = (rate: number, net: Money, tax: Money): TaxRateSummary => ({
        rate,
        netAmount: toDecimalAmount(net, currency),
        taxAmount: toDecimalAmount(tax, currency),
        grossAmount: toDecimalAmount(addMoney(net, tax), currency)
    });

    const taxSummary = sortedGroups.map(([rate, group]) =>
        rowOf(rate, netOf(addMoney(group.goodsGross, group.shippingGross), group.tax), group.tax)
    );
    // A rate with no shipping apportioned to it is left out, not printed as an empty row.
    const shippingByRate = sortedGroups
        .map(([rate, group]) =>
            rowOf(rate, netOf(group.shippingGross, group.shippingTax), group.shippingTax)
        )
        .filter((row) => row.netAmount > 0 || row.taxAmount > 0);

    const shippingNetTotal = subtractMoney(
        sumOf((g) => g.shippingGross),
        sumOf((g) => g.shippingTax)
    );
    const netTotal = subtractMoney(
        sumOf((g) => g.goodsGross),
        sumOf((g) => g.goodsTax)
    );

    return {
        lines,
        netTotal: toDecimalAmount(netTotal, currency),
        taxTotal: toDecimalAmount(
            sumOf((g) => g.tax),
            currency
        ),
        shippingNetAmount: toDecimalAmount(shippingNetTotal, currency),
        shippingTaxAmount: toDecimalAmount(
            sumOf((g) => g.shippingTax),
            currency
        ),
        taxSummary,
        shippingByRate
    };
};
