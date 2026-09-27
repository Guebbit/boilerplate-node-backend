/**
 * @module
 * Invoicing service — every operation a controller or an event listener may call into.
 * `issue-invoice.ts` freezes an invoice off `ORDER_STATUS_CHANGED`; `issue-credit-note.ts` freezes
 * a credit note off `PAYMENT_REFUNDED`; `render.ts` turns either into PDF bytes through the
 * e-invoicing port.
 */

import { issueInvoice, findInvoiceForOrder } from './issue-invoice';
import { issueCreditNote, findCreditNoteForOrder } from './issue-credit-note';
import { renderInvoicePdf, renderCreditNotePdf } from './render';

export { issueInvoice, findInvoiceForOrder } from './issue-invoice';
export { issueCreditNote, findCreditNoteForOrder } from './issue-credit-note';
export { renderInvoicePdf, renderCreditNotePdf } from './render';
export { allocateInvoiceNumber, allocateCreditNoteNumber } from './numbering';

/** The service's public surface — every controller and event listener goes through this. */
export const invoicingService = {
    issueInvoice,
    findInvoiceForOrder,
    issueCreditNote,
    findCreditNoteForOrder,
    renderInvoicePdf,
    renderCreditNotePdf
};
