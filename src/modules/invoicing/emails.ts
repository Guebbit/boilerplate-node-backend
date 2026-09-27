/**
 * @module
 * The copy of every document this module renders, resolved into finished strings — same rule as
 * `@modules/orders/emails`: the language is an argument, the output is finished text, and the EJS
 * template queued behind it only interpolates. Named `emails.ts` to match that module's own
 * convention for "this file builds a document's copy", even though nothing here is mailed — the
 * PDF is downloaded, never sent.
 */

import type { TFunction } from 'i18next';
import { translator } from '@infrastructure/i18n';
import { orderTaxBreakdown } from '@modules/orders';
import type { EInvoicingDocument } from './providers';

/** One row of the VAT table — a line's own figures, already formatted for interpolation. */
export interface DocumentVatRow {
    description: string;
    quantity: number;
    unitPrice: string;
    netAmount: string;
    taxRateLabel: string;
    taxAmount: string;
    grossAmount: string;
}

/** One row of a rate-grouped table — the shipping breakdown or the per-rate summary. */
export interface DocumentTaxSummaryRow {
    description: string;
    netAmount: string;
    taxRateLabel: string;
    taxAmount: string;
    grossAmount: string;
}

/** The document's VAT table, its totals, and the seller's own legal identity — see `buildVatBlock`. */
export interface DocumentVatBlock {
    columns: {
        description: string;
        quantity: string;
        unitPrice: string;
        net: string;
        rate: string;
        tax: string;
        gross: string;
    };
    rows: DocumentVatRow[];
    shipping?: { title: string; rows: DocumentTaxSummaryRow[] };
    summaryTitle: string;
    summaryRows: DocumentTaxSummaryRow[];
    netTotalLabel: string;
    netTotal: string;
    taxTotalLabel: string;
    taxTotal: string;
    grandTotalLabel: string;
    grandTotal: string;
    supplier: {
        legalName?: string;
        vatNumberLine: string;
        address?: string;
    };
}

/** The number-and-date block every document prints under its title. */
const buildMeta = (locale: string, t: TFunction, document: EInvoicingDocument) => ({
    numberLabel: t('invoicing.document.number', { number: document.number }),
    dateLabel: t('invoicing.document.date', {
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(document.issuedAt)
    })
});

/** The frozen billing address block, or `undefined` for a digital-only / pre-address-book order. */
const buildBilling = (document: EInvoicingDocument) => {
    const address = document.billingAddress;
    if (!address) return undefined;
    return {
        fullName: address.fullName,
        lines: [address.street, `${address.zip} ${address.city}`, address.country]
    };
};

/**
 * Builds the document's VAT table and the seller's own legal identity, recomputing nothing: every
 * figure was already reconciled by `orders/domain/tax.ts#orderTaxBreakdown` at issue time and
 * frozen onto the document — this only formats what is already there.
 * @param locale - the document's language, for `Intl.NumberFormat`/`Intl.NumberFormat` — every
 *   amount below goes through it, in the document's OWN frozen currency
 */
const buildVatBlock = (
    locale: string,
    t: TFunction,
    document: EInvoicingDocument
): DocumentVatBlock => {
    // One instance, reused for every amount — a real allocation, not worth paying once per cell.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: document.currency });
    // A decimal rate (`0.055`) as the document prints it (`"5.5%"`).
    const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });

    // Re-derived from the frozen `unitPrice`/`taxRate`/`quantity` alone, via the same pure
    // function `services/issue-invoice.ts` used to freeze the ORDER-level totals — safe because a
    // single line's own net/tax/gross split needs nothing else (unlike the shipping apportionment,
    // which needs `requiresShipping`, a fact this frozen line does not carry, so THAT stays
    // frozen — `document.taxSummary`/`shippingByRate` below, never re-derived here).
    const perLine = orderTaxBreakdown({
        items: document.lines.map((line) => ({
            quantity: line.quantity,
            product: { price: line.unitPrice, taxRate: line.taxRate }
        }))
    }).lines;

    const rows: DocumentVatRow[] = document.lines.map((line, index) => ({
        description: line.title,
        quantity: line.quantity,
        unitPrice: money.format(line.unitPrice),
        netAmount: money.format(perLine[index].netAmount),
        taxRateLabel: percent.format(line.taxRate),
        taxAmount: money.format(perLine[index].taxAmount),
        grossAmount: money.format(perLine[index].grossAmount)
    }));

    const summaryRowOf = (
        row: { rate: number; netAmount: number; taxAmount: number; grossAmount: number },
        description: string
    ): DocumentTaxSummaryRow => ({
        description,
        netAmount: money.format(row.netAmount),
        taxRateLabel: percent.format(row.rate),
        taxAmount: money.format(row.taxAmount),
        grossAmount: money.format(row.grossAmount)
    });

    const { seller, shippingByRate, taxSummary, netTotal, taxTotal, grandTotal } = document;
    const addressLine = [
        seller.street,
        [seller.zip, seller.city].filter(Boolean).join(' '),
        seller.country
    ]
        .filter(Boolean)
        .join(', ');

    return {
        columns: {
            description: t('invoicing.document.vat.column-description'),
            quantity: t('invoicing.document.vat.column-quantity'),
            unitPrice: t('invoicing.document.vat.column-unit-price'),
            net: t('invoicing.document.vat.column-net'),
            rate: t('invoicing.document.vat.column-rate'),
            tax: t('invoicing.document.vat.column-tax'),
            gross: t('invoicing.document.vat.column-gross')
        },
        rows,
        shipping:
            shippingByRate.length === 0
                ? undefined
                : {
                      title: t('invoicing.document.vat.shipping-title'),
                      rows: shippingByRate.map((row) =>
                          summaryRowOf(
                              row,
                              t('invoicing.document.vat.shipping-row', {
                                  rate: percent.format(row.rate)
                              })
                          )
                      )
                  },
        summaryTitle: t('invoicing.document.vat.summary-title'),
        summaryRows: taxSummary.map((row) =>
            summaryRowOf(
                row,
                t('invoicing.document.vat.summary-row', { rate: percent.format(row.rate) })
            )
        ),
        netTotalLabel: t('invoicing.document.vat.net-total'),
        netTotal: money.format(netTotal),
        taxTotalLabel: t('invoicing.document.vat.tax-total'),
        taxTotal: money.format(taxTotal),
        grandTotalLabel: t('invoicing.document.vat.grand-total'),
        grandTotal: money.format(grandTotal),
        supplier: {
            legalName: seller.legalName,
            vatNumberLine: seller.vatNumber
                ? t('invoicing.document.vat.vat-number', { number: seller.vatNumber })
                : t('invoicing.document.vat.vat-number-missing'),
            address: addressLine || undefined
        }
    };
};

/**
 * Render context for an invoice or credit-note PDF — the same shape either way, since a credit
 * note is a full reversal of the invoice it corrects (today's refund model) rather than a
 * differently-structured document.
 * @param locale - the document's own frozen language
 * @param document - every frozen field the provider was handed
 * @returns the EJS render context `shared/templates/documents/invoicing.invoice.ejs` interpolates
 */
export const buildDocumentView = (
    locale: string,
    document: EInvoicingDocument
): Record<string, unknown> => {
    const t = translator(locale);
    const isCreditNote = document.kind === 'creditNote';

    return {
        locale,
        pageMetaTitle: t(
            isCreditNote
                ? 'invoicing.document.credit-note-meta-title'
                : 'invoicing.document.meta-title',
            { number: document.number }
        ),
        pageMetaLinks: [],
        title: t(
            isCreditNote ? 'invoicing.document.credit-note-title' : 'invoicing.document.title'
        ),
        reversalNotice:
            isCreditNote && document.reversalOf
                ? t('invoicing.document.reversal-notice', { number: document.reversalOf.number })
                : undefined,
        meta: buildMeta(locale, t, document),
        billing: buildBilling(document),
        lines: document.lines.map((line) =>
            t('invoicing.document.line', {
                title: line.title,
                quantity: line.quantity,
                price: line.unitPrice
            })
        ),
        vat: buildVatBlock(locale, t, document)
    };
};
