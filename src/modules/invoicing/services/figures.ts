/**
 * @module
 * The money a document stands for, derived from an invoice: what a full credit note mirrors, and
 * what a correction cancels and reissues. Two callers share it (`issue-credit-note.ts`,
 * `correct-invoice`), so a cancelled invoice and its replacement can never disagree on a cent.
 *
 * @see docs/modules/invoicing.md#correcting-the-buyer
 */

import { translator } from '@infrastructure/i18n';
import { orderTotal } from '@modules/orders';
import { asTaxItems, remainderLines, type CreditLine } from '../domain';
import { creditBreakdownOf } from './credit-breakdown';
import type { CreditNoteDocument, FrozenTaxDocument, InvoiceDocument } from '../model';

/** The figures one document freezes: its lines and every total, shipping included. */
export type DocumentFigures = Pick<
    FrozenTaxDocument,
    | 'lines'
    | 'shippingCost'
    | 'netTotal'
    | 'taxTotal'
    | 'shippingNetAmount'
    | 'shippingTaxAmount'
    | 'taxSummary'
    | 'shippingByRate'
    | 'grandTotal'
>;

/**
 * An invoice's own figures, wholesale: a full credit note reverses exactly these, and a correction
 * with nothing credited yet reissues exactly these.
 * @param invoice - the invoice being mirrored
 */
export const mirrorOf = (invoice: InvoiceDocument): DocumentFigures => ({
    lines: invoice.lines,
    ...(invoice.shippingCost === undefined ? {} : { shippingCost: invoice.shippingCost }),
    netTotal: invoice.netTotal,
    taxTotal: invoice.taxTotal,
    shippingNetAmount: invoice.shippingNetAmount,
    shippingTaxAmount: invoice.shippingTaxAmount,
    taxSummary: invoice.taxSummary,
    shippingByRate: invoice.shippingByRate,
    grandTotal: invoice.grandTotal
});

/**
 * The figures of a document made of per-rate gross lines: VAT is extracted from the lines the way
 * the invoice itself did it, so the figures reconcile exactly.
 * @param lines - the per-rate lines (a refund's shares, or a remainder)
 * @param currency - the invoice's currency
 */
export const figuresOfLines = (lines: CreditLine[], currency: string): DocumentFigures => {
    const breakdown = creditBreakdownOf(lines, currency);
    return {
        lines,
        netTotal: breakdown.netTotal,
        taxTotal: breakdown.taxTotal,
        shippingNetAmount: breakdown.shippingNetAmount,
        shippingTaxAmount: breakdown.shippingTaxAmount,
        taxSummary: breakdown.taxSummary,
        shippingByRate: breakdown.shippingByRate,
        grandTotal: orderTotal({ items: asTaxItems(lines), shippingCost: undefined, currency })
    };
};

/**
 * What an invoice still stands for once credit notes took part of it.
 *
 * No credit note: the invoice as it is. Otherwise one line per VAT rate with something left, titled
 * after its source (Art. 226(6): a line says what was supplied), with VAT derived the way a partial
 * credit note's is.
 *
 * @param invoice - the live invoice
 * @param notes - every credit note already issued against it
 * @returns the figures, or `undefined` once nothing is left to cancel or reissue
 */
export const remainderOf = (
    invoice: InvoiceDocument,
    notes: readonly CreditNoteDocument[]
): DocumentFigures | undefined => {
    if (notes.length === 0) return mirrorOf(invoice);

    const lines = remainderLines(
        invoice.taxSummary,
        notes.map((note) => note.taxSummary),
        invoice.currency,
        translator(invoice.locale)('invoicing.document.remainder-line', {
            invoice: invoice.number,
            creditNotes: notes.map((note) => note.number).join(', ')
        })
    );
    if (lines.length === 0) return undefined;

    return figuresOfLines(lines, invoice.currency);
};
