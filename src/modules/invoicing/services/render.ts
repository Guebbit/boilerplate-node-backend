/**
 * @module
 * Turning a frozen invoice or credit note into its PDF bytes — the one place either document
 * reaches {@link resolveEInvoicingProvider}, so a controller never has to know the port exists.
 *
 * Rendered on the FIRST download, not at issue (an invoice nobody opens costs no Chromium and no
 * disk), then kept on disk for `NODE_INVOICE_PDF_RETENTION_DAYS` and streamed from there. The
 * frozen data in Mongo is the record; the stored file is a regenerable copy.
 */

import { logger } from '@infrastructure/adapters/logger';
import { readDocument, writeDocument } from '@infrastructure/adapters/document-store';
import { invoicingConfig } from '../config';
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
 * The stored copy of a document, or a fresh render that is then stored.
 *
 * `0` retention stores nothing: always a render. A failing store (a read error, a full disk) must
 * never fail the download, so either half falls back to rendering and says so in the log. Two
 * simultaneous first downloads both render, which is harmless: the bytes are the same, and the
 * store's write is atomic.
 *
 * @param name - the stored name, e.g. `invoice-<id>.pdf`
 * @param render - renders the document from its frozen row
 */
const storedOrRendered = (name: string, render: () => Promise<Buffer>): Promise<Buffer> => {
    if (invoicingConfig().NODE_INVOICE_PDF_RETENTION_DAYS === 0) return render();

    return readDocument(name)
        .catch((error: unknown) => {
            // Stryker disable next-line all
            logger.warn({
                message: 'A stored document could not be read; rendering it.',
                name,
                error
            });
            return undefined;
        })
        .then(
            (stored) =>
                stored ??
                render().then((bytes) =>
                    writeDocument(name, bytes).then(
                        () => bytes,
                        (error: unknown) => {
                            // Stryker disable next-line all
                            logger.warn({
                                message: 'A rendered document could not be stored.',
                                name,
                                error
                            });
                            return bytes;
                        }
                    )
                )
        );
};

/**
 * Renders one issued invoice's PDF — every render reads the same frozen row, so two downloads of
 * the same invoice always produce byte-identical copies (barring a provider upgrade), and the
 * second is the stored one.
 * @param invoice - the invoice to render
 * @returns the rendered artefact's bytes
 */
export const renderInvoicePdf = (invoice: InvoiceDocument): Promise<Buffer> =>
    storedOrRendered(`invoice-${String(invoice._id)}.pdf`, () =>
        resolveEInvoicingProvider()
            .issue({ kind: 'invoice', ...sharedFields(invoice) })
            .then((artifact) => artifact.bytes)
    );

/**
 * Renders one issued credit note's PDF, printing which invoice it reverses.
 * @param creditNote - the credit note to render
 * @returns the rendered artefact's bytes
 */
export const renderCreditNotePdf = (creditNote: CreditNoteDocument): Promise<Buffer> =>
    storedOrRendered(`credit-note-${String(creditNote._id)}.pdf`, () =>
        resolveEInvoicingProvider()
            .issue({
                kind: 'creditNote',
                ...sharedFields(creditNote),
                reversalOf: { number: creditNote.invoiceNumber }
            })
            .then((artifact) => artifact.bytes)
    );
