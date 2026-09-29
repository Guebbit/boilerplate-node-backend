/**
 * @module
 * The one place this module's frozen documents become JSON — `POST /account/export`'s own
 * section, and the credit-note list. Every other read this module serves answers a rendered PDF
 * (`get-order-invoice.ts`, `get-order-credit-note.ts`), never the frozen document itself.
 */

import type { CreditNoteSummary } from '@types';
import type { InvoiceDocument, CreditNoteDocument } from './model';

/** One issued document, in export-wire shape — never the full internal document. */
export interface ExportedDocument {
    orderId: string;
    number: string;
    issuedAt: Date;
    currency: string;
    grandTotal: number;
}

/** Formats a frozen invoice or credit note for the export envelope. */
export const presentExportedDocument = (
    document: InvoiceDocument | CreditNoteDocument
): ExportedDocument => ({
    orderId: String(document.orderId),
    number: document.number,
    issuedAt: document.issuedAt,
    currency: document.currency,
    grandTotal: document.grandTotal
});

/** Formats a credit note as one row of the per-order list. */
export const presentCreditNoteSummary = (creditNote: CreditNoteDocument): CreditNoteSummary => ({
    id: String(creditNote._id),
    number: creditNote.number,
    issuedAt: creditNote.issuedAt.toISOString(),
    currency: creditNote.currency,
    grandTotal: creditNote.grandTotal,
    refundId: creditNote.refundId
});
