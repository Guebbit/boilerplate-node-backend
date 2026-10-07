/**
 * @module
 * The invoice and credit-note Mongoose schemas, plus their own yearly numbering counters — the
 * same `{ _id: year, seq }` convention `orders/model.ts`'s `OrderNumberCounterDocument` already
 * uses, one counter per series so a credit note's numbering can never borrow a number from the
 * invoice's own sequence. Both series are gap-free: see `services/numbering.ts`.
 *
 * Both documents are FROZEN at issue: every field below is copied from the order (or the invoice,
 * for a credit note) at the moment it is written, never re-read or re-joined afterwards. Neither
 * is ever exposed as JSON — the only door onto either is a rendered PDF — so there is no
 * serialization transform here, unlike every other model in this codebase.
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { RateType, type OrderTaxSummaryRow } from '@types';
import type { ShopIdentity } from '@modules/orders';

/**
 * One frozen line — a product's title, quantity and the price/rate it was actually sold at. No
 * per-line net/tax/gross split stored here: the render pipeline re-derives it from these same four
 * fields via `orderTaxBreakdown`, the pure function this module reuses rather than re-implements —
 * storing the derived figures too would only be a second place for them to drift from what that
 * function computes. Order-level and shipping-apportioned figures ARE frozen below, since THOSE
 * depend on `requiresShipping` — a fact this line does not carry — and cannot be safely re-derived
 * from the line alone.
 */
export interface InvoiceLine {
    title: string;
    quantity: number;
    /** Gross (VAT-inclusive) unit price, exactly as `OrderLineProduct.price` freezes it. */
    unitPrice: number;
    /** The decimal VAT rate this line was actually charged — `0.22` for 22%. */
    taxRate: number;
    /**
     * WHY `taxRate` is 0, when it is — copied straight from the order line's own frozen
     * `rateType`. Absent means `standard`. `emails.ts#taxCategoryCode` reads this alongside
     * `taxRate` to print EN 16931's `Z` (zero-rated) vs `E` (exempt) category code.
     */
    rateType?: RateType;
}

/** A billing or seller postal address, frozen onto the document at issue — Art. 226(e)/(f). */
export interface InvoiceParty {
    fullName: string;
    street: string;
    city: string;
    zip: string;
    country: string;
}

/**
 * The seller's own legal identity, frozen onto the document at issue — Art. 226(d)/(f)/(g). The
 * shop's identity less the contact fields an invoice does not carry, every field optional.
 */
export type InvoiceSeller = Partial<Omit<ShopIdentity, 'email' | 'phone'>>;

/**
 * Fields an invoice and a credit note both freeze — everything Art. 226 and EN 16931's BR-CO-17
 * VAT-category reconciliation need, copied once and never revisited.
 */
export interface FrozenTaxDocument {
    /** The order this document was issued for. Never populated — a document outlives the order's own account link, same as the order itself. */
    orderId: Types.ObjectId;
    /** `{year}-{sequence}`, this series' own — see `services/numbering.ts`. */
    number: string;
    /** The moment this document was issued — an order's `paidAt` for an invoice, a payment's refund moment for a credit note. */
    issuedAt: Date;
    /** ISO-4217, frozen from the ORDER's own `currency` — never re-read from config. */
    currency: string;
    /** The language every string on the rendered PDF is in — the order's own frozen locale. */
    locale: string;
    /** The order's own `orderNumber`, printed for cross-reference — absent on an order that predates it. */
    orderNumber?: string;
    /** Absent on a digital-only order, or one placed before the address book existed. */
    billingAddress?: InvoiceParty;
    seller: InvoiceSeller;
    lines: InvoiceLine[];
    /** The shipping cost frozen at checkout — absent exactly when the order's own field is. */
    shippingCost?: number;
    netTotal: number;
    taxTotal: number;
    shippingNetAmount: number;
    shippingTaxAmount: number;
    /** One row per distinct VAT rate — BR-CO-17: sums back to `netTotal`/`taxTotal` exactly. */
    taxSummary: OrderTaxSummaryRow[];
    /** Shipping's own slice of `taxSummary`, broken out per rate — see `orders/domain/tax.ts`. */
    shippingByRate: OrderTaxSummaryRow[];
    /** Every line's gross plus shipping — the amount actually paid. */
    grandTotal: number;
}

/** One issued invoice. */
export interface InvoiceDocument extends FrozenTaxDocument, Document {}

/** Invoice model type. */
export type InvoiceModel = Model<InvoiceDocument>;

/**
 * One issued credit note — the reversal of ONE refund. A full refund mirrors the invoice it
 * corrects; a partial one carries only the refunded share, so an order refunded in parts has one
 * credit note per part.
 */
export interface CreditNoteDocument extends FrozenTaxDocument, Document {
    /** The `payments` refund record this credit note is for — what makes issuing it idempotent. */
    refundId: string;
    /** The invoice this credit note reverses — always present: nothing is refunded before it is invoiced. */
    invoiceId: Types.ObjectId;
    /** The invoice's own number, printed for cross-reference without a lookup. */
    invoiceNumber: string;
}

/** Credit note model type. */
export type CreditNoteModel = Model<CreditNoteDocument>;

/** A frozen postal address, embedded on either document — `_id: false`, same as `orders`' own `OrderAddress` embed. */
const partySchema = new Schema<InvoiceParty>(
    {
        fullName: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        zip: { type: String, required: true },
        country: { type: String, required: true }
    },
    { _id: false }
);

/** The seller's identity, embedded — every field optional, since a demo deployment may set none of them. */
const sellerSchema = new Schema<InvoiceSeller>(
    {
        legalName: { type: String },
        vatNumber: { type: String },
        street: { type: String },
        city: { type: String },
        zip: { type: String },
        country: { type: String }
    },
    { _id: false }
);

/** One frozen line, embedded — `_id: false`, nothing ever addresses a line by its own id. */
const lineSchema = new Schema<InvoiceLine>(
    {
        title: { type: String, required: true },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        taxRate: { type: Number, required: true, min: 0, max: 1 },
        rateType: { type: String, enum: Object.values(RateType) }
    },
    { _id: false }
);

/** One VAT-rate summary row, embedded — the shape `orders/domain/tax.ts#TaxRateSummary` returns. */
const taxSummaryRowSchema = new Schema<OrderTaxSummaryRow>(
    {
        rate: { type: Number, required: true },
        netAmount: { type: Number, required: true },
        taxAmount: { type: Number, required: true },
        grossAmount: { type: Number, required: true }
    },
    { _id: false }
);

/** The fields {@link invoiceSchema} and {@link creditNoteSchema} both declare — kept in one place so neither can drift from the other. */
const frozenTaxDocumentFields = {
    orderId: { type: Schema.Types.ObjectId, required: true },
    number: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    currency: { type: String, required: true },
    locale: { type: String, required: true },
    orderNumber: { type: String },
    billingAddress: { type: partySchema },
    seller: { type: sellerSchema, required: true },
    lines: { type: [lineSchema], required: true },
    shippingCost: { type: Number, min: 0 },
    netTotal: { type: Number, required: true },
    taxTotal: { type: Number, required: true },
    shippingNetAmount: { type: Number, required: true },
    shippingTaxAmount: { type: Number, required: true },
    taxSummary: { type: [taxSummaryRowSchema], required: true },
    shippingByRate: { type: [taxSummaryRowSchema], required: true },
    grandTotal: { type: Number, required: true }
};

/**
 * Mongoose schema for an issued invoice. `timestamps: true` for `createdAt` alone (an operational
 * fact, distinct from `issuedAt`'s legal one); nothing here is ever updated, so `updatedAt` is
 * unused but harmless.
 */
const invoiceSchema = new Schema<InvoiceDocument, InvoiceModel>(frozenTaxDocumentFields, {
    timestamps: true
});

// One invoice per order — `repository.ts`'s own duplicate-key guard is what makes a redelivered
// event idempotent; this index is what makes that guarantee real at the database, not just in the
// listener's own logic.
invoiceSchema.index({ orderId: 1 }, { name: 'invoices_orderId', unique: true });

/** Mongoose model for issued invoices. */
export const invoiceModel = model<InvoiceDocument, InvoiceModel>('Invoice', invoiceSchema);

/** Mongoose schema for an issued credit note — every invoice field, plus the invoice it reverses. */
const creditNoteSchema = new Schema<CreditNoteDocument, CreditNoteModel>(
    {
        ...frozenTaxDocumentFields,
        invoiceId: { type: Schema.Types.ObjectId, required: true },
        invoiceNumber: { type: String, required: true },
        refundId: { type: String, required: true }
    },
    { timestamps: true }
);

// One credit note per REFUND — `PAYMENT_REFUNDED` is fired from an at-most-once write, but the
// event bus promises no de-duplication of its own, so this index is what makes a redelivered
// event issue nothing twice. An order refunded in parts legitimately has several.
creditNoteSchema.index({ refundId: 1 }, { name: 'creditNotes_refundId', unique: true });

// Backs the per-order list `GET /orders/{id}/credit-notes` reads.
creditNoteSchema.index({ orderId: 1, issuedAt: 1 }, { name: 'creditNotes_orderId_issuedAt' });

/** Mongoose model for issued credit notes. */
export const creditNoteModel = model<CreditNoteDocument, CreditNoteModel>(
    'CreditNote',
    creditNoteSchema
);

/** One document per calendar year, holding a numbering series' running sequence. */
export interface NumberCounterDocument extends Document<number> {
    seq: number;
}

/** Mongoose model type for a numbering counter. */
export type NumberCounterModel = Model<NumberCounterDocument>;

/** The counter schema both series share — only the collection (model name) differs between them. */
const numberCounterSchema = new Schema<NumberCounterDocument, NumberCounterModel>({
    _id: { type: Number },
    seq: { type: Number, required: true, default: 0 }
});

/** The invoice series' own counter — independent from `orders`' `orderNumberCounterModel`. */
export const invoiceNumberCounterModel = model<NumberCounterDocument, NumberCounterModel>(
    'InvoiceNumberCounter',
    numberCounterSchema
);

/** The credit-note series' own counter — independent from both the invoice and the order series. */
export const creditNoteNumberCounterModel = model<NumberCounterDocument, NumberCounterModel>(
    'CreditNoteNumberCounter',
    numberCounterSchema
);
