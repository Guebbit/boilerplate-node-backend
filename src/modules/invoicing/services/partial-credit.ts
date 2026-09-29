/**
 * @module
 * The lines and VAT of a credit note that reverses only PART of an invoice — pure, so the
 * arithmetic is testable without a database.
 *
 * The refunded gross amount is spread across the invoice's VAT rates in proportion to what each
 * rate collected, goods and shipping together, and each share becomes one line at that rate. VAT is
 * then extracted from every share the way the invoice itself did it (`orderTaxBreakdown`), so the
 * credit note's figures reconcile exactly and its rates are always rates the invoice charged.
 */

import {
    apportion,
    orderTaxBreakdown,
    toDecimalAmount,
    toMinorUnits,
    type OrderTaxBreakdown
} from '@modules/orders';
import type { InvoiceDocument, InvoiceLine } from '../model';

/** What a partial credit note freezes in place of the invoice's own lines and totals. */
export interface PartialCredit {
    lines: InvoiceLine[];
    breakdown: OrderTaxBreakdown;
}

/**
 * Split a refunded amount across an invoice's VAT rates.
 *
 * @param invoice - the invoice being partly reversed
 * @param amount - the refunded gross amount, a decimal in the invoice's currency
 * @param lineTitle - the description every line carries, already in the invoice's language
 * @returns one line per rate that took a share, and the VAT breakdown those lines derive
 */
export const partialCredit = (
    invoice: InvoiceDocument,
    amount: number,
    lineTitle: string
): PartialCredit => {
    const { currency, taxSummary } = invoice;
    const shares = apportion(
        toMinorUnits(amount, currency),
        taxSummary.map((row) => toMinorUnits(row.grossAmount, currency))
    );

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
