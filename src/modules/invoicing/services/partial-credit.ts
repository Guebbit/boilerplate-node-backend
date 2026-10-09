/**
 * @module
 * The lines and VAT of a credit note that reverses only PART of an invoice — pure, so the
 * arithmetic is testable without a database.
 *
 * The refunded gross amount is spread across the invoice's VAT rates, and each share becomes one
 * line at that rate. VAT is then extracted from every share the way the invoice itself did it
 * (`orderTaxBreakdown`), so the figures reconcile exactly and every rate is one the invoice charged.
 *
 * What each rate weighs depends on what the refund pays back:
 *
 * Goods:    a refund for specific goods (a return) weighs only those lines, plus the delivery it
 *           refunds split the way the invoice split it. VAT Directive Art. 90: the taxable amount
 *           of the goods that came back is reduced, at the rate they were sold at.
 * Goodwill: a refund tied to no goods weighs every rate by what it collected — the pro-rata rule
 *           for a price reduction across a mixed-rate invoice.
 *
 * A deduction or an earlier partial refund makes the refund smaller than its goods: the weights
 * then split what was actually refunded, never more.
 *
 * See: docs/modules/invoicing.md#issuing-a-document
 */

import {
    addMoney,
    apportion,
    orderTaxBreakdown,
    scaleMoney,
    toDecimalAmount,
    toMinorUnits,
    NO_MONEY,
    type Money,
    type OrderTaxBreakdown
} from '@modules/orders';
import type { InvoiceDocument, InvoiceLine } from '../model';

/** What a partial credit note freezes in place of the invoice's own lines and totals. */
export interface PartialCredit {
    lines: InvoiceLine[];
    breakdown: OrderTaxBreakdown;
}

/** The goods and delivery a refund pays back — `PAYMENT_REFUNDED`'s `goods`. */
export interface RefundedGoods {
    lines: readonly { productId: string; quantity: number }[];
    /** The delivery cost inside the refund, a decimal. */
    shipping: number;
}

/**
 * How much of each invoice rate the refunded goods and delivery are worth, in minor units — one
 * weight per `taxSummary` row, in its order.
 *
 * @param invoice - the invoice being partly reversed
 * @param goods - what the refund pays back
 * @returns the weights; all zero when nothing matched a line of the invoice
 */
const goodsWeights = (invoice: InvoiceDocument, goods: RefundedGoods): Money[] => {
    const { currency, lines, shippingByRate, taxSummary } = invoice;
    const weights = new Map<number, Money>(taxSummary.map((row) => [row.rate, NO_MONEY]));
    const add = (rate: number, amount: Money): void => {
        weights.set(rate, addMoney(weights.get(rate) ?? NO_MONEY, amount));
    };

    for (const { productId, quantity } of goods.lines) {
        const line = lines.find((candidate) => String(candidate.productId) === productId);
        if (line) add(line.taxRate, scaleMoney(toMinorUnits(line.unitPrice, currency), quantity));
    }

    // Delivery is credited at the rates the invoice charged it at, in the same proportions.
    const shippingShares = apportion(
        toMinorUnits(goods.shipping, currency),
        shippingByRate.map((row) => toMinorUnits(row.grossAmount, currency))
    );
    for (const [index, row] of shippingByRate.entries()) add(row.rate, shippingShares[index]);

    return taxSummary.map((row) => weights.get(row.rate) ?? NO_MONEY);
};

/**
 * Split a refunded amount across an invoice's VAT rates.
 *
 * @param invoice - the invoice being partly reversed
 * @param amount - the refunded gross amount, a decimal in the invoice's currency
 * @param lineTitle - the description every line carries, already in the invoice's language
 * @param goods - what the refund pays back, when it pays for specific goods; absent for goodwill
 * @returns one line per rate that took a share, and the VAT breakdown those lines derive
 */
export const partialCredit = (
    invoice: InvoiceDocument,
    amount: number,
    lineTitle: string,
    goods?: RefundedGoods
): PartialCredit => {
    const { currency, taxSummary } = invoice;
    const everyRate = taxSummary.map((row) => toMinorUnits(row.grossAmount, currency));
    const weighted = goods ? goodsWeights(invoice, goods) : everyRate;
    // Goods that match no line of the invoice have no rate to go to: fall back to the pro-rata rule.
    const weights = addMoney(...weighted) === NO_MONEY ? everyRate : weighted;
    const shares = apportion(toMinorUnits(amount, currency), weights);

    const lines = taxSummary.flatMap((row, index): InvoiceLine[] =>
        shares[index] > 0
            ? [
                  {
                      title: lineTitle,
                      quantity: 1,
                      unitPrice: toDecimalAmount(shares[index], currency),
                      taxRate: row.rate
                  }
              ]
            : []
    );

    const breakdown = orderTaxBreakdown({
        items: lines.map((line) => ({
            quantity: line.quantity,
            product: { price: line.unitPrice, taxRate: line.taxRate, requiresShipping: false }
        })),
        shippingCost: undefined,
        currency
    });

    return { lines, breakdown };
};
