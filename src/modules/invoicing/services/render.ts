/**
 * @module
 * Turning a frozen invoice or credit note into its PDF bytes — the one place either document
 * reaches {@link resolveEInvoicingProvider}, so a controller never has to know the port exists.
 */

import { resolveEInvoicingProvider } from '../providers';
import type { EInvoicingDocument } from '../providers';
import type { InvoiceDocument, CreditNoteDocument } from '../model';

/** The fields both documents share, as the provider port needs them — see `FrozenTaxDocument`. */
const sharedFields = (
    document: InvoiceDocument | CreditNoteDocument
): Omit<EInvoicingDocument, 'kind'> => ({
    number: document.number,
    issuedAt: document.issuedAt,
    currency: document.currency,
    locale: document.locale,
    orderNumber: document.orderNumber,
    billingAddress: document.billingAddress,
    seller: document.seller,
    lines: document.lines,
    shippingCost: document.shippingCost,
    netTotal: document.netTotal,
    taxTotal: document.taxTotal,
    shippingNetAmount: document.shippingNetAmount,
    shippingTaxAmount: document.shippingTaxAmount,
    taxSummary: document.taxSummary,
    shippingByRate: document.shippingByRate,
    grandTotal: document.grandTotal
});

/**
 * Renders one issued invoice's PDF — every render reads the same frozen row, so two downloads of
 * the same invoice always produce byte-identical copies (barring a provider upgrade).
 * @param invoice - the invoice to render
 * @returns the rendered artefact's bytes
 */
export const renderInvoicePdf = (invoice: InvoiceDocument): Promise<Buffer> =>
    resolveEInvoicingProvider()
        .issue({ kind: 'invoice', ...sharedFields(invoice) })
        .then((artifact) => artifact.bytes);

/**
 * Renders one issued credit note's PDF, printing which invoice it reverses.
 * @param creditNote - the credit note to render
 * @returns the rendered artefact's bytes
 */
export const renderCreditNotePdf = (creditNote: CreditNoteDocument): Promise<Buffer> =>
    resolveEInvoicingProvider()
        .issue({
            kind: 'creditNote',
            ...sharedFields(creditNote),
            reversalOf: { number: creditNote.invoiceNumber }
        })
        .then((artifact) => artifact.bytes);
