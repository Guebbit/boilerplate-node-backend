/**
 * @module
 * `POST /account/export`'s own section for this module — see `module.ts`'s `personalData`. No
 * `erase`: neither collection stores `userId` at all, only `orderId`, so there is nothing here to
 * unlink once `orders`' own `detachUserId` has already broken that link on the order itself — the
 * same Art. 17(3)(b)/(e) retention exemption `orders/model.ts`'s own `userId` comment documents.
 */

import { findOwnOrders } from '@modules/orders';
import { invoicingRepository } from '../repository';
import type { InvoiceDocument, CreditNoteDocument } from '../model';

/** One issued document, in export-wire shape — never the full internal document. */
export interface ExportedDocument {
    orderId: string;
    number: string;
    issuedAt: Date;
    currency: string;
    grandTotal: number;
}

/** Formats a frozen document for the export envelope. */
const toExported = (document: InvoiceDocument | CreditNoteDocument): ExportedDocument => ({
    orderId: String(document.orderId),
    number: document.number,
    issuedAt: document.issuedAt,
    currency: document.currency,
    grandTotal: document.grandTotal
});

/**
 * Every invoice and credit note issued for one account's own orders — collected by first reading
 * `orders`' own export (the account's order ids), then this module's two collections by
 * `orderId`, since neither is itself keyed by `userId`.
 * @param userId - the account requesting its export
 */
export const collectPersonalData = (
    userId: string
): Promise<{ invoices: ExportedDocument[]; creditNotes: ExportedDocument[] }> =>
    findOwnOrders(userId).then((orders) =>
        Promise.all(
            orders.map((order) =>
                Promise.all([
                    invoicingRepository.findInvoiceByOrderId(order.id),
                    invoicingRepository.findCreditNoteByOrderId(order.id)
                ])
            )
        ).then((pairs) => ({
            invoices: pairs.flatMap(([invoice]) => (invoice ? [toExported(invoice)] : [])),
            creditNotes: pairs.flatMap(([, creditNote]) =>
                creditNote ? [toExported(creditNote)] : []
            )
        }))
    );
