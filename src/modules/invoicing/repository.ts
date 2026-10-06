/**
 * @module
 * Persistence for invoices, credit notes and their two numbering counters. Hand-written rather
 * than `@infrastructure/persistence/create-repository`'s generic CRUD: neither document is ever
 * searched, paginated, updated or deleted — each is written once and read back by `orderId` — so
 * the generic factory would buy nothing this module needs.
 */

import { Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import {
    invoiceModel,
    creditNoteModel,
    invoiceNumberCounterModel,
    creditNoteNumberCounterModel
} from './model';
import type { FrozenTaxDocument, InvoiceDocument, CreditNoteDocument } from './model';

/**
 * The invoice for an order, if one has been issued.
 * @param orderId - the order to look up
 */
const findInvoiceByOrderId = (orderId: string): Promise<InvoiceDocument | null> =>
    invoiceModel.findOne({ orderId: new Types.ObjectId(orderId) }).exec();

/**
 * A document's own `_id`, chosen by the caller before the insert.
 * Allocated outside the transaction that writes it, so a retried transaction reuses the same id.
 */
interface WithId {
    _id: Types.ObjectId;
}

/**
 * Insert a new invoice. A second invoice for one order is refused by the schema's own unique
 * index with a duplicate-key error: the caller reads the winner back once its transaction aborts.
 * @param fields - every frozen field the invoice is issued with, and its pre-allocated `_id`
 * @param session - the transaction that also allocated the invoice's number
 * @returns the inserted invoice
 */
const insertInvoice = (
    fields: FrozenTaxDocument & WithId,
    session?: ClientSession
): Promise<InvoiceDocument> =>
    // Mongoose `create` with an array is the only form that takes `{ session }`; it resolves an array.
    // https://mongoosejs.com/docs/api/model.html#Model.create()
    invoiceModel.create([fields], { session }).then(([invoice]) => invoice);

/**
 * Every credit note issued for an order, oldest first — one per refund.
 * @param orderId - the order to look up
 */
const findCreditNotesByOrderId = (orderId: string): Promise<CreditNoteDocument[]> =>
    creditNoteModel
        .find({ orderId: new Types.ObjectId(orderId) })
        .sort({ issuedAt: 1, _id: 1 })
        .exec();

/**
 * One credit note, addressed within its order — an id that belongs to another order is `null`, the
 * same as an id that does not exist.
 * @param orderId - the order the credit note must belong to
 * @param creditNoteId - the credit note
 */
const findCreditNoteById = (
    orderId: string,
    creditNoteId: string
): Promise<CreditNoteDocument | null> =>
    creditNoteModel
        .findOne({
            _id: new Types.ObjectId(creditNoteId),
            orderId: new Types.ObjectId(orderId)
        })
        .exec();

/**
 * The credit note issued for one refund, if any.
 * @param refundId - the `payments` refund record
 */
const findCreditNoteByRefundId = (refundId: string): Promise<CreditNoteDocument | null> =>
    creditNoteModel.findOne({ refundId }).exec();

/**
 * Insert a new credit note. A second one for one refund is refused by the unique `refundId` index,
 * for the same reason as {@link insertInvoice}: `PAYMENT_REFUNDED` is fired from an at-most-once
 * write, but the event bus itself promises no de-duplication of its own.
 * @param fields - every frozen field, plus the invoice this credit note reverses, its refund and
 *   its pre-allocated `_id`
 * @param session - the transaction that also allocated the credit note's number
 */
const insertCreditNote = (
    fields: FrozenTaxDocument &
        WithId & {
            invoiceId: Types.ObjectId;
            invoiceNumber: string;
            refundId: string;
        },
    session?: ClientSession
): Promise<CreditNoteDocument> =>
    creditNoteModel.create([fields], { session }).then(([creditNote]) => creditNote);

/**
 * Atomically allocate the next sequence number in a counter for `year`, upserting the year's row
 * on its first use — the same primitive `orders/repository.ts#incrementOrderNumberCounter` uses,
 * shared here since both this module's series need it.
 * @param counterModel - which series' counter to increment
 * @param year - the UTC calendar year the sequence belongs to
 * @param session - the transaction the allocation belongs to: an aborted insert gives the number back
 * @returns the sequence number just allocated (1 for the year's first document in that series)
 */
const incrementCounter = (
    counterModel: typeof invoiceNumberCounterModel,
    year: number,
    session?: ClientSession
): Promise<number> =>
    counterModel
        .findOneAndUpdate(
            { _id: year },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after', session }
        )
        .exec()
        .then((counter) => counter.seq);

/** Invoicing's own repository — no generic CRUD, see the module docblock. */
export const invoicingRepository = {
    findInvoiceByOrderId,
    insertInvoice,
    findCreditNotesByOrderId,
    findCreditNoteById,
    findCreditNoteByRefundId,
    insertCreditNote,
    incrementInvoiceNumberCounter: (year: number, session?: ClientSession): Promise<number> =>
        incrementCounter(invoiceNumberCounterModel, year, session),
    incrementCreditNoteNumberCounter: (year: number, session?: ClientSession): Promise<number> =>
        incrementCounter(creditNoteNumberCounterModel, year, session)
};
