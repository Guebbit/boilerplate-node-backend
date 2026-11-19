/**
 * @module
 * Cancelling an invoice whose buyer details staff corrected, and issuing it again to the right
 * buyer — `module.ts`'s `order.billing_corrected` listener's whole job. No money moves: the credit
 * note and the new invoice carry the same figures, so the books net to zero (VAT Directive Art. 219:
 * a change to an invoice is a new document that points back to the old one).
 *
 * What is cancelled is what is still invoiced: the invoice minus the credit notes already issued
 * for it (`./figures.ts#remainderOf`), so a partly refunded order is never credited twice. Nothing
 * left means nothing issued.
 *
 * One transaction: credit note, the old invoice's flip to `corrected`, the new invoice and the
 * order's timeline row all commit or none does, so the gap-free series lose no number. A redelivered
 * event is a no-op through the credit note's `correctionKey` (the outbox event's id).
 *
 * @see docs/modules/invoicing.md#correcting-the-buyer
 */

import { Types, type ClientSession } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';
import { orderService } from '@modules/orders';
import { shopTimezone } from '@modules/shop';
import { invoicingRepository } from '../repository';
import { decryptInvoiceParty, encryptInvoiceParty } from '../pii';
import { allocateCreditNoteNumber, allocateInvoiceNumber, readWinner } from './numbering';
import { buyerOf, findInvoiceForOrder, frozenSeller } from './issue-invoice';
import { remainderOf, type DocumentFigures } from './figures';
import type { CreditNoteDocument, InvoiceDocument, InvoiceParty } from '../model';

/**
 * The credit note that cancels the old invoice: its own figures (or what is left of them), and the
 * OLD buyer block, since a credit note reproduces what it cancels.
 *
 * @param invoice - the invoice being cancelled
 * @param figures - what is still invoiced on it
 * @param ids - the credit note's pre-allocated `_id`, its number and its issue instant
 * @param correctionKey - the outbox event's id
 */
const cancellingCreditNote = (
    invoice: InvoiceDocument,
    figures: DocumentFigures,
    ids: { _id: Types.ObjectId; number: string; issuedAt: Date },
    correctionKey: string
) => ({
    ...ids,
    orderId: invoice.orderId,
    invoiceId: invoice._id,
    invoiceNumber: invoice.number,
    reason: 'correction' as const,
    correctionKey,
    // The invoice's own zone: a note reads like the invoice it cancels.
    timezone: invoice.timezone,
    currency: invoice.currency,
    locale: invoice.locale,
    orderNumber: invoice.orderNumber,
    // Decrypted under the invoice's id, re-encrypted under the note's own.
    ...(invoice.billingAddress
        ? {
              billingAddress: encryptInvoiceParty(
                  decryptInvoiceParty(invoice.billingAddress, 'invoice', invoice._id),
                  'credit-note',
                  ids._id
              )
          }
        : {}),
    seller: invoice.seller,
    ...figures
});

/**
 * The replacement invoice: the same figures, issued now, to the corrected buyer.
 *
 * @param invoice - the invoice being replaced
 * @param figures - what is still invoiced on it
 * @param ids - the new invoice's pre-allocated `_id`, its number and its issue instant
 * @param buyer - the corrected buyer, from the order; `undefined` when the order carries none
 */
const replacementInvoice = (
    invoice: InvoiceDocument,
    figures: DocumentFigures,
    ids: { _id: Types.ObjectId; number: string; issuedAt: Date },
    buyer: InvoiceParty | undefined
) => ({
    ...ids,
    orderId: invoice.orderId,
    timezone: shopTimezone(),
    currency: invoice.currency,
    locale: invoice.locale,
    orderNumber: invoice.orderNumber,
    ...(buyer ? { billingAddress: encryptInvoiceParty(buyer, 'invoice', ids._id) } : {}),
    // Issued now, so the seller is read now, as at any other issue.
    seller: frozenSeller(),
    ...figures
});

/** Everything one correction needs, decided before its transaction opens so a driver retry reuses it. */
interface Correction {
    /** The live invoice being replaced. */
    invoice: InvoiceDocument;
    /** The corrected buyer; `undefined` when the order carries no billing address. */
    buyer: InvoiceParty | undefined;
    /** The outbox event's id. */
    correctionKey: string;
    /** One instant for both numbers' year and both dates. */
    issuedAt: Date;
    noteId: Types.ObjectId;
    invoiceId: Types.ObjectId;
}

/**
 * The unit of work: work out what is still invoiced, allocate both numbers, write both documents,
 * retire the old invoice and leave the timeline row.
 *
 * What is still invoiced is read HERE, in the transaction, not before it. A refund settling at the
 * same moment writes the same credit-note counter, so the two transactions conflict, and the loser
 * runs again from the top: a correction then sees the refund's credit note, and a refund then sees
 * the invoice already cancelled (`issue-credit-note.ts`). Reading outside would let both credit
 * the same money.
 *
 * Throws when the invoice stopped being the live one since it was read: the event is then retried
 * against the newer invoice.
 *
 * @param correction - what to write
 * @param session - the correction's transaction
 * @throws {Error} when another correction already cancelled the invoice
 */
const correctWithin = async (correction: Correction, session: ClientSession): Promise<void> => {
    const { invoice, buyer, correctionKey, issuedAt } = correction;

    // First of all: is this still the live invoice? A winning correction may have cancelled it and
    // credited it in full, which would read below as "nothing left" and drop this correction silently.
    const live = await invoicingRepository.findInvoiceByOrderId(String(invoice.orderId), session);
    if (!live?._id.equals(invoice._id))
        throw new Error(`Invoice ${invoice.number} is no longer the live invoice of its order`);

    const notes = await invoicingRepository.findCreditNotesByInvoiceId(invoice._id, session);
    const figures = remainderOf(invoice, notes);
    // Everything was credited already: nothing to cancel, nothing to reissue.
    if (!figures) return;

    const noteNumber = await allocateCreditNoteNumber(issuedAt, session);
    const note = await invoicingRepository.insertCreditNote(
        cancellingCreditNote(
            invoice,
            figures,
            { _id: correction.noteId, number: noteNumber, issuedAt },
            correctionKey
        ),
        session
    );

    if (!(await invoicingRepository.markInvoiceCorrected(invoice._id, session)))
        throw new Error(`Invoice ${invoice.number} is no longer the live invoice of its order`);

    const number = await allocateInvoiceNumber(issuedAt, session);
    const issued = await invoicingRepository.insertInvoice(
        replacementInvoice(
            invoice,
            figures,
            { _id: correction.invoiceId, number, issuedAt },
            buyer
        ),
        session
    );

    await orderService.appendTimeline(
        String(invoice.orderId),
        {
            type: 'invoice_corrected',
            data: {
                invoiceId: String(issued._id),
                number: issued.number,
                creditNoteId: String(note._id),
                creditNoteNumber: note.number
            }
        },
        session
    );
};

/**
 * Cancel the order's live invoice and reissue it to the buyer the order now names. A no-op when
 * the order has no invoice yet (its future invoice freezes the corrected address) or nothing is
 * left invoiced on it.
 *
 * @param orderId - the order whose billing address staff corrected
 * @param eventId - the `order.billing_corrected` outbox event's id, the key that makes a
 *   redelivery issue nothing; absent for a plain in-process emit, which has no redelivery
 * @returns the credit note this correction issued (or the one a redelivery already issued), or
 *   `undefined` when there was nothing to correct
 * @internal Freezes two numbered legal documents: only this module's `order.billing_corrected` listener may call it, so it is not on `invoicingService`.
 */
export const correctInvoice = (
    orderId: string,
    eventId: string | undefined
): Promise<CreditNoteDocument | undefined> =>
    Promise.all([findInvoiceForOrder(orderId), orderService.getById(orderId)]).then(
        async ([invoice, order]) => {
            if (!invoice || !order) return undefined;

            const billing = orderService.billingAddressOf(order);
            const correctionKey = eventId ?? String(new Types.ObjectId());
            const correction: Correction = {
                invoice,
                buyer: billing ? buyerOf(billing) : undefined,
                correctionKey,
                issuedAt: new Date(),
                noteId: new Types.ObjectId(),
                invoiceId: new Types.ObjectId()
            };

            return withTransaction((session) => correctWithin(correction, session))
                .then(() => invoicingRepository.findCreditNoteByCorrectionKey(correctionKey))
                .catch(
                    readWinner(() =>
                        invoicingRepository.findCreditNoteByCorrectionKey(correctionKey)
                    )
                )
                .then((note) => note ?? undefined);
        }
    );
