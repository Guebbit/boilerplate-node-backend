/**
 * @module
 * Freezing a credit note off a refund — `module.ts`'s `PAYMENT_REFUNDED` listener's whole job.
 * Today's `payments` only ever refunds the FULL amount of a `succeeded` payment (see
 * `payments/services/refunds.ts` — there is no partial-refund flow yet), so this mirrors the
 * ORIGINAL invoice's lines and totals wholesale rather than computing a partial credit; a future
 * partial-refund design (SH5) will need its own input here, not a change to this shape.
 *
 * See: docs/modules/invoicing.md
 */

import { invoicingRepository } from '../repository';
import { findInvoiceForOrder } from './issue-invoice';
import { allocateCreditNoteNumber } from './numbering';
import type { CreditNoteDocument } from '../model';

/**
 * Freezes and numbers a credit note for the invoice already issued on `orderId`. A no-op —
 * `undefined`, never a throw — when no invoice exists to correct: today's `payments` only refunds
 * a `succeeded` payment, and every `succeeded` payment belongs to a `paid` order this module has
 * already invoiced, so the gap only opens on a genuine race (an invoice not yet frozen when the
 * refund lands) or on data older than this module. Either way there is nothing a credit note could
 * reference, so none is issued rather than one pointing at nothing.
 *
 * @param orderId - the order whose payment was just refunded
 * @returns the credit note just issued, or `undefined` when there was no invoice to correct
 */
export const issueCreditNote = (orderId: string): Promise<CreditNoteDocument | undefined> =>
    findInvoiceForOrder(orderId).then((invoice) => {
        if (!invoice) return undefined;

        return allocateCreditNoteNumber().then((number) =>
            invoicingRepository.insertCreditNote({
                orderId: invoice.orderId,
                invoiceId: invoice._id,
                invoiceNumber: invoice.number,
                number,
                issuedAt: new Date(),
                currency: invoice.currency,
                locale: invoice.locale,
                ...(invoice.orderNumber ? { orderNumber: invoice.orderNumber } : {}),
                ...(invoice.billingAddress ? { billingAddress: invoice.billingAddress } : {}),
                seller: invoice.seller,
                lines: invoice.lines,
                ...(invoice.shippingCost === undefined
                    ? {}
                    : { shippingCost: invoice.shippingCost }),
                netTotal: invoice.netTotal,
                taxTotal: invoice.taxTotal,
                shippingNetAmount: invoice.shippingNetAmount,
                shippingTaxAmount: invoice.shippingTaxAmount,
                taxSummary: invoice.taxSummary,
                shippingByRate: invoice.shippingByRate,
                grandTotal: invoice.grandTotal
            })
        );
    });

/**
 * The credit note for one order, or `null` if it has none — `GET /orders/{id}/credit-note`'s own
 * existence check. At most one per order under today's full-refund-only model — see
 * `model.ts`'s own unique index.
 * @param orderId - the order to look up
 */
export const findCreditNoteForOrder = (orderId: string): Promise<CreditNoteDocument | null> =>
    invoicingRepository.findCreditNoteByOrderId(orderId);
