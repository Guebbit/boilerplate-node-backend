/**
 * @module
 * Invoicing service — every operation a controller or an event listener may call into.
 * `issue-invoice.ts` freezes an invoice off `ORDER_STATUS_CHANGED`; `issue-credit-note.ts` freezes
 * a credit note per refund off `PAYMENT_REFUNDED`; `render.ts` turns either into PDF bytes through the
 * e-invoicing port.
 */

import { issueInvoice, findInvoiceForOrder } from './issue-invoice';
import { findCreditNotesForOrder, findCreditNoteForOrderById } from './issue-credit-note';
import { renderInvoicePdf, renderCreditNotePdf } from './render';
import { invoiceForCaller, creditNotesForCaller, creditNoteForCaller } from './for-caller';
import { moneyBuckets } from './stats';

import { reencryptInvoices } from './reencrypt';

export type { RefundedInput } from './issue-credit-note';
export type { DocumentTotals, MoneyBucket } from './stats';

/** The module's one door — every operation, so a sibling or a test reaches one place. */
export const invoicingService = {
    issueInvoice,
    findInvoiceForOrder,
    findCreditNotesForOrder,
    findCreditNoteForOrderById,
    invoiceForCaller,
    creditNotesForCaller,
    creditNoteForCaller,
    renderInvoicePdf,
    renderCreditNotePdf,
    moneyBuckets,
    reencryptInvoices
};
