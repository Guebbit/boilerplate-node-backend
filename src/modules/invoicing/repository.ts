/**
 * @module
 * Persistence for invoices, credit notes and their two numbering counters. Hand-written rather
 * than `@infrastructure/persistence/create-repository`'s generic CRUD: neither document is ever
 * searched, paginated, updated or deleted — each is written once and read back by `orderId` — so
 * the generic factory would buy nothing this module needs.
 */

import { reencryptOf } from '@infrastructure/security/reencrypt';
import { bucketOf, type ReportWindow } from '@infrastructure/persistence/report';
import { incrementYearlyCounter } from '@infrastructure/persistence/yearly-counter';
import { Types } from 'mongoose';
import type { ClientSession, Document, Model } from 'mongoose';
import {
    invoiceModel,
    creditNoteModel,
    invoiceNumberCounterModel,
    creditNoteNumberCounterModel
} from './model';
import type { FrozenTaxDocument, InvoiceDocument, CreditNoteDocument } from './model';
import type { InvoiceDocumentKind } from './pii';

/**
 * The invoice for an order, if one has been issued.
 * @param orderId - the order to look up
 */
const findInvoiceByOrderId = (orderId: string): Promise<InvoiceDocument | null> =>
    invoiceModel.findOne({ orderId: new Types.ObjectId(orderId) }).exec();

/** One bucket of one currency, summed. The sums are decimals as Mongo returns them. */
export interface DocumentBucketRow {
    currency: string;
    bucket: Date;
    documents: number;
    goodsNet: unknown;
    shippingNet: unknown;
    tax: unknown;
    gross: unknown;
}

/**
 * Documents issued in a window, summed per currency and bucket. Goods are `netTotal` minus the
 * shipping net it includes, subtracted as stored Decimal128, so cents do not drift.
 *
 * @param model - the invoice or credit-note collection
 * @param window - the half-open window and the bucket size
 */
const sumDocuments = <TDocument extends Document>(
    model: Model<TDocument>,
    window: ReportWindow
): Promise<DocumentBucketRow[]> =>
    model
        .aggregate<{
            _id: { currency: string; bucket: Date };
            documents: number;
            goodsNet: unknown;
            shippingNet: unknown;
            tax: unknown;
            gross: unknown;
        }>([
            { $match: { issuedAt: { $gte: window.from, $lt: window.to } } },
            {
                $group: {
                    _id: { currency: '$currency', bucket: bucketOf('$issuedAt', window) },
                    documents: { $sum: 1 },
                    goodsNet: {
                        $sum: { $subtract: ['$netTotal', '$shippingNetAmount'] }
                    },
                    shippingNet: { $sum: '$shippingNetAmount' },
                    tax: { $sum: '$taxTotal' },
                    gross: { $sum: '$grandTotal' }
                }
            }
        ])
        .exec()
        .then((rows) =>
            rows.map(({ _id, ...sums }) => ({
                currency: _id.currency,
                bucket: _id.bucket,
                ...sums
            }))
        );

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
 * @param session - the transaction that also allocated the invoice's number; required, since the
 *   number is only safe to take inside the unit that inserts the document
 * @returns the inserted invoice
 */
const insertInvoice = (
    fields: FrozenTaxDocument & WithId,
    session: ClientSession
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
 * @param session - the transaction that also allocated the credit note's number; required, for
 *   the same reason as {@link insertInvoice}
 */
const insertCreditNote = (
    fields: FrozenTaxDocument &
        WithId & {
            invoiceId: Types.ObjectId;
            invoiceNumber: string;
            refundId: string;
        },
    session: ClientSession
): Promise<CreditNoteDocument> =>
    creditNoteModel.create([fields], { session }).then(([creditNote]) => creditNote);

/** What the retention rule reads from a document that still holds a buyer block. */
export interface BuyerBearingDocument {
    _id: Types.ObjectId;
    issuedAt: Date;
    timezone: string;
}

/**
 * The buyer sweep's two queries over one collection. Generic over the model, as `sumDocuments`
 * is, because a union of the two model types does not type-check in Mongoose.
 *
 * @param model - the invoice or credit-note collection
 */
const buyerSweepOf = <TDocument extends Document>(model: Model<TDocument>) => ({
    // Reads the `issuedAt` index; the exact due rule runs on what comes back.
    findBefore: (bound: Date): Promise<BuyerBearingDocument[]> =>
        model
            .find({ issuedAt: { $lt: bound }, billingAddress: { $exists: true } })
            .select('issuedAt timezone')
            .lean<BuyerBearingDocument[]>()
            .exec(),
    // The filter repeats "still has a block", so a second or racing run changes nothing.
    erase: (ids: Types.ObjectId[], at: Date): Promise<number> =>
        model
            .updateMany(
                { _id: { $in: ids }, billingAddress: { $exists: true } },
                { $unset: { billingAddress: 1 }, $set: { buyerErasedAt: at } }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount)
});

/** The buyer sweep of each collection, by kind. */
const buyerSweeps = {
    invoice: buyerSweepOf(invoiceModel),
    'credit-note': buyerSweepOf(creditNoteModel)
};

/**
 * Documents issued before `bound` that still hold a buyer block.
 *
 * @param kind - which collection
 * @param bound - exclusive upper bound on `issuedAt`
 */
const findBuyerBearingBefore = (
    kind: InvoiceDocumentKind,
    bound: Date
): Promise<BuyerBearingDocument[]> => buyerSweeps[kind].findBefore(bound);

/**
 * Unsets the buyer block of the given documents and stamps when.
 *
 * @param kind - which collection
 * @param ids - the documents to blank
 * @param at - the moment recorded as `buyerErasedAt`
 * @returns how many documents were changed
 */
const eraseBuyers = (kind: InvoiceDocumentKind, ids: Types.ObjectId[], at: Date): Promise<number> =>
    buyerSweeps[kind].erase(ids, at);

/** Invoicing's own repository — no generic CRUD, see the module docblock. */
export const invoicingRepository = {
    reencryptInvoices: reencryptOf(invoiceModel),
    reencryptCreditNotes: reencryptOf(creditNoteModel),
    findInvoiceByOrderId,
    findBuyerBearingBefore,
    eraseBuyers,
    sumInvoices: (window: ReportWindow) => sumDocuments(invoiceModel, window),
    sumCreditNotes: (window: ReportWindow) => sumDocuments(creditNoteModel, window),
    insertInvoice,
    findCreditNotesByOrderId,
    findCreditNoteById,
    findCreditNoteByRefundId,
    insertCreditNote,
    // Required session: the number and the insert must commit or abort together, or the gap-free
    // series loses a number (VAT Directive Art. 226(2)).
    incrementInvoiceNumberCounter: (year: number, session: ClientSession): Promise<number> =>
        incrementYearlyCounter(invoiceNumberCounterModel, year, session),
    incrementCreditNoteNumberCounter: (year: number, session: ClientSession): Promise<number> =>
        incrementYearlyCounter(creditNoteNumberCounterModel, year, session)
};
