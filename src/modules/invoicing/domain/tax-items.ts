/**
 * @module
 * An issued document's lines, as the tax functions read them. The one spelling of "this line is a
 * priced, taxed item", so the invoice email, a credit note's totals and its VAT breakdown cannot
 * read a line three different ways.
 */

/**
 * A frozen document line, mapped to the shape `orderTaxBreakdown` and `lineTaxFromRateTotals` take.
 * @param lines - the document's lines, each with its gross unit price and the rate it was charged at
 */
export const asTaxItems = (
    lines: readonly { quantity: number; unitPrice: number; taxRate: number }[]
): { quantity: number; product: { price: number; taxRate: number } }[] =>
    lines.map((line) => ({
        quantity: line.quantity,
        product: { price: line.unitPrice, taxRate: line.taxRate }
    }));
