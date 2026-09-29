/**
 * @module
 * Persistence for invoices, credit notes and their two numbering counters. Hand-written rather
 * than `@infrastructure/persistence/create-repository`'s generic CRUD: neither document is ever
 * searched, paginated, updated or deleted — each is written once and read back by `orderId` — so
 * the generic factory would buy nothing this module needs.
 */

import { Types } from 'mongoose';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
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
 * Insert a new invoice — idempotent on `orderId` through the schema's own unique index: a
 * redelivered `ORDER_STATUS_CHANGED` event racing another writer's insert loses cleanly, reading
 * back the row the winner wrote instead of throwing past its caller.
 * @param fields - every frozen field the invoice is issued with
 * @returns the inserted invoice, or the one that already existed for this order
 */
const insertInvoice = (fields: FrozenTaxDocument): Promise<InvoiceDocument> =>
    invoiceModel.create(fields).catch((error: unknown) => {
        if (!isDuplicateKey(error)) throw error;
        return findInvoiceByOrderId(String(fields.orderId)).then((existing) => {
            // Unreachable outside a corrupted unique index: the duplicate key error IS the
            // existing row's own guarantee that a `findOne` right behind it finds something.
            if (!existing) throw error;
            return existing;
        });
    });

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
 * Insert a new credit note — idempotent on `refundId`, for the same reason as
 * {@link insertInvoice}: `PAYMENT_REFUNDED` is fired from an at-most-once write, but the event bus
 * itself promises no de-duplication of its own.
 * @param fields - every frozen field, plus the invoice this credit note reverses and its refund
 */
const insertCreditNote = (
    fields: FrozenTaxDocument & {
        invoiceId: Types.ObjectId;
        invoiceNumber: string;
        refundId: string;
    }
): Promise<CreditNoteDocument> =>
    creditNoteModel.create(fields).catch((error: unknown) => {
        if (!isDuplicateKey(error)) throw error;
        return findCreditNoteByRefundId(fields.refundId).then((existing) => {
            if (!existing) throw error;
            return existing;
        });
    });

/**
 * Atomically allocate the next sequence number in a counter for `year`, upserting the year's row
 * on its first use — the same primitive `orders/repository.ts#incrementOrderNumberCounter` uses,
 * shared here since both this module's series need it.
 * @param counterModel - which series' counter to increment
 * @param year - the UTC calendar year the sequence belongs to
 * @returns the sequence number just allocated (1 for the year's first document in that series)
 */
const incrementCounter = (
    counterModel: typeof invoiceNumberCounterModel,
    year: number
): Promise<number> =>
    counterModel
        .findOneAndUpdate(
            { _id: year },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after' }
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
    incrementInvoiceNumberCounter: (year: number): Promise<number> =>
        incrementCounter(invoiceNumberCounterModel, year),
    incrementCreditNoteNumberCounter: (year: number): Promise<number> =>
        incrementCounter(creditNoteNumberCounterModel, year)
};
