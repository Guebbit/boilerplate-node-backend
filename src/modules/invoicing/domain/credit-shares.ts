/**
 * @module
 * The lines of a credit note that reverses only PART of an invoice — pure, so the arithmetic is
 * testable without a database, a model or the tax function.
 *
 * The refunded gross amount is spread across the invoice's VAT rates, and each share becomes one
 * line at that rate. Every rate is one the invoice charged; the VAT is extracted from the lines
 * afterwards by `src/modules/invoicing/services/credit-breakdown.ts`, the way the invoice itself did it.
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
    scaleMoney,
    toDecimalAmount,
    toMinorUnits,
    NO_MONEY,
    type Money
} from '@domain-primitives/money';

/** The part of an invoice the split reads, as plain data — the invoice document is not this layer's. */
export interface CreditableInvoice {
    currency: string;
    /** The invoice's lines; `productId` is how returned goods find the rate they were sold at. */
    lines: readonly { productId?: string | undefined; unitPrice: number; taxRate: number }[];
    /** Delivery's own slice of the summary, per rate. */
    shippingByRate: readonly { rate: number; grossAmount: number }[];
    /** One row per distinct VAT rate the invoice charged. */
    taxSummary: readonly { rate: number; grossAmount: number }[];
}

/** The goods and delivery a refund pays back — `PAYMENT_REFUNDED`'s `goods`. */
export interface RefundedGoods {
    lines: readonly { productId: string; quantity: number }[];
    /** The delivery cost inside the refund, a decimal. */
    shipping: number;
}

/** One line of a partial credit note: a share of the refund, at one rate the invoice charged. */
export interface CreditLine {
    title: string;
    quantity: 1;
    /** Gross (VAT-inclusive) amount of this share. */
    unitPrice: number;
    /** The decimal VAT rate this share is credited at. */
    taxRate: number;
}

/**
 * How much of each invoice rate the refunded goods and delivery are worth, in minor units — one
 * weight per `taxSummary` row, in its order.
 *
 * @param invoice - the invoice being partly reversed
 * @param goods - what the refund pays back
 * @returns the weights; all zero when nothing matched a line of the invoice
 */
const goodsWeights = (invoice: CreditableInvoice, goods: RefundedGoods): Money[] => {
    const { currency, lines, shippingByRate, taxSummary } = invoice;
    const weights = new Map<number, Money>(taxSummary.map((row) => [row.rate, NO_MONEY]));
    const add = (rate: number, amount: Money): void => {
        weights.set(rate, addMoney(weights.get(rate) ?? NO_MONEY, amount));
    };

    for (const { productId, quantity } of goods.lines) {
        const line = lines.find((candidate) => candidate.productId === productId);
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
 * @returns one line per rate that took a share
 */
export const creditShares = (
    invoice: CreditableInvoice,
    amount: number,
    lineTitle: string,
    goods?: RefundedGoods
): CreditLine[] => {
    const { currency, taxSummary } = invoice;
    const everyRate = taxSummary.map((row) => toMinorUnits(row.grossAmount, currency));
    const weighted = goods ? goodsWeights(invoice, goods) : everyRate;
    // Goods that match no line of the invoice have no rate to go to: fall back to the pro-rata rule.
    const weights = addMoney(...weighted) === NO_MONEY ? everyRate : weighted;
    const shares = apportion(toMinorUnits(amount, currency), weights);

    return taxSummary.flatMap((row, index): CreditLine[] =>
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
};
