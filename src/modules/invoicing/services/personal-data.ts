/**
 * @module
 * `POST /account/export`'s own section for this module — see `module.ts`'s `personalData`. No
 * `erase`: neither collection stores `userId` at all, only `orderId`, so there is nothing here to
 * unlink once `orders`' own `detachUserId` has already broken that link on the order itself — the
 * same Art. 17(3)(b)/(e) retention exemption `orders/model.ts`'s own `userId` comment documents.
 */

import { findOwnOrders } from '@modules/orders';
import { invoicingRepository } from '../repository';
import { presentExportedDocument, type ExportedDocument } from '../presenter';

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
                    invoicingRepository.findCreditNotesByOrderId(order.id)
                ])
            )
        ).then((pairs) => ({
            invoices: pairs.flatMap(([invoice]) =>
                invoice ? [presentExportedDocument(invoice)] : []
            ),
            creditNotes: pairs.flatMap(([, creditNotes]) =>
                creditNotes.map((note) => presentExportedDocument(note))
            )
        }))
    );
