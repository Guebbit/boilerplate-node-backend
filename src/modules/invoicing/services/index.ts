/**
 * @module
 * Invoicing service — every operation a controller or an event listener may call into.
 * `issue-invoice.ts` freezes an invoice off `ORDER_STATUS_CHANGED`; `issue-credit-note.ts` freezes
 * a credit note per refund off `PAYMENT_REFUNDED`; `render.ts` turns either into PDF bytes through the
 * e-invoicing port.
 */

import { issueInvoice, findInvoiceForOrder } from './issue-invoice';
import {
    issueCreditNote,
    findCreditNotesForOrder,
    findCreditNoteForOrderById
} from './issue-credit-note';
import { renderInvoicePdf, renderCreditNotePdf } from './render';
import { invoiceForCaller, creditNotesForCaller, creditNoteForCaller } from './for-caller';
import { moneyBuckets } from './stats';

export { issueInvoice, findInvoiceForOrder } from './issue-invoice';
export {
    issueCreditNote,
    findCreditNotesForOrder,
    findCreditNoteForOrderById,
    type RefundedInput
} from './issue-credit-note';
export { renderInvoicePdf, renderCreditNotePdf } from './render';
export type { DocumentTotals, MoneyBucket } from './stats';
export { reencryptInvoices } from './reencrypt';

/** The service's public surface — every controller and event listener goes through this. */
export const invoicingService = {
    issueInvoice,
    findInvoiceForOrder,
    issueCreditNote,
    findCreditNotesForOrder,
    findCreditNoteForOrderById,
    invoiceForCaller,
    creditNotesForCaller,
    creditNoteForCaller,
    renderInvoicePdf,
    renderCreditNotePdf,
    moneyBuckets
};
