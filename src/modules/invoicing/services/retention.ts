/**
 * @module
 * `reap:invoices`: blanks the buyer block of every invoice and credit note whose tax retention has
 * ended. The numbered document stays, with its seller, lines and amounts: stats read revenue from
 * it and a credit note points at its invoice. Only the person goes.
 *
 * See: docs/modules/invoicing.md#retention
 */

import { removeDocument } from '@infrastructure/adapters/document-store';
import { invoicingConfig } from '../config';
import { buyerRetentionScanBound, isBuyerRetentionOver } from '../domain';
import { invoicingRepository } from '../repository';
import type { InvoiceDocumentKind } from '../pii';
import { storedDocumentName } from './render';

/** How many documents of each kind lost their buyer block. */
export interface BuyerErasureReport {
    invoices: number;
    creditNotes: number;
}

/**
 * Blanks the due documents of one kind, then deletes their cached PDFs. Blank first: a PDF
 * rendered between the two steps would carry no buyer, and a PDF that survives a crash is reaped
 * by `reap:invoice-pdfs` within its own window.
 *
 * @param kind - which collection
 * @param years - the retention in years
 * @param now - the moment to judge against, and to stamp
 */
const eraseKind = (kind: InvoiceDocumentKind, years: number, now: Date): Promise<number> =>
    invoicingRepository
        .findBuyerBearingBefore(kind, buyerRetentionScanBound(years, now))
        .then((candidates) =>
            candidates.filter((document) => isBuyerRetentionOver(document, years, now))
        )
        .then((due) =>
            due.length === 0
                ? 0
                : invoicingRepository
                      .eraseBuyers(
                          kind,
                          due.map((document) => document._id),
                          now
                      )
                      .then((erased) =>
                          Promise.all(
                              due.map((document) =>
                                  removeDocument(storedDocumentName(kind, document._id))
                              )
                          ).then(() => erased)
                      )
        );

/**
 * The `reap:invoices` sweep. Idempotent: a document without a buyer block is not a candidate.
 *
 * @param now - the moment to judge against; a test passes its own
 * @returns how many invoices and credit notes were blanked
 */
export const eraseDueBuyers = (now = new Date()): Promise<BuyerErasureReport> => {
    const years = invoicingConfig().NODE_INVOICE_BUYER_RETENTION_YEARS;
    return Promise.all([
        eraseKind('invoice', years, now),
        eraseKind('credit-note', years, now)
    ]).then(([invoices, creditNotes]) => ({ invoices, creditNotes }));
};
