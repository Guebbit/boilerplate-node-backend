/**
 * @module
 * Freezing a credit note off a refund — `module.ts`'s `PAYMENT_REFUNDED` listener's whole job. One
 * credit note per REFUND: a full refund mirrors the ORIGINAL invoice's lines and totals wholesale,
 * a partial one carries only the refunded share (see `./partial-credit.ts`), so an order refunded
 * in parts ends up with a credit note per part.
 *
 * See: docs/modules/invoicing.md
 */

import { Types } from 'mongoose';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { withTransaction } from '@infrastructure/runtime/database';
import { orderTotal } from '@modules/orders';
import { translator } from '@infrastructure/i18n';
import { invoicingRepository } from '../repository';
import { decryptInvoiceParty, encryptInvoiceParty } from '../pii';
import { findInvoiceForOrder } from './issue-invoice';
import { allocateCreditNoteNumber } from './numbering';
import { partialCredit } from './partial-credit';
import type { CreditNoteDocument, InvoiceDocument } from '../model';

/** The refund a credit note is issued for — `PAYMENT_REFUNDED`'s payload, as this module needs it. */
export interface RefundedInput {
    orderId: string;
    refundId: string;
    /** This refund's gross amount, a decimal in the invoice's currency. */
    amount: number;
    /** Whether this refund is the whole payment — the one case that mirrors the invoice. */
    full: boolean;
}

/**
 * The frozen figures a credit note carries: the invoice's own for a full refund, or the refunded
 * share re-derived across its VAT rates for a partial one.
 *
 * @param invoice - the invoice being reversed
 * @param input - the refund
 */
const reversedFigures = (
    invoice: InvoiceDocument,
    input: RefundedInput
): Pick<
    CreditNoteDocument,
    | 'lines'
    | 'netTotal'
    | 'taxTotal'
    | 'shippingNetAmount'
    | 'shippingTaxAmount'
    | 'taxSummary'
    | 'shippingByRate'
    | 'grandTotal'
> & { shippingCost?: number } => {
    if (input.full)
        return {
            lines: invoice.lines,
            ...(invoice.shippingCost === undefined ? {} : { shippingCost: invoice.shippingCost }),
            netTotal: invoice.netTotal,
            taxTotal: invoice.taxTotal,
            shippingNetAmount: invoice.shippingNetAmount,
            shippingTaxAmount: invoice.shippingTaxAmount,
            taxSummary: invoice.taxSummary,
            shippingByRate: invoice.shippingByRate,
            grandTotal: invoice.grandTotal
        };

    const { lines, breakdown } = partialCredit(
        invoice,
        input.amount,
        translator(invoice.locale)('invoicing.document.partial-refund-line')
    );
    return {
        lines,
        netTotal: breakdown.netTotal,
        taxTotal: breakdown.taxTotal,
        shippingNetAmount: breakdown.shippingNetAmount,
        shippingTaxAmount: breakdown.shippingTaxAmount,
        taxSummary: breakdown.taxSummary,
        shippingByRate: breakdown.shippingByRate,
        grandTotal: orderTotal({
            items: lines.map((line) => ({
                quantity: line.quantity,
                product: { price: line.unitPrice, taxRate: line.taxRate }
            })),
            shippingCost: undefined,
            currency: invoice.currency
        })
    };
};

/**
 * What a lost race reads back: the credit note the winner wrote for this refund.
 * @param refundId - the refund both writers were crediting
 * @returns a `catch` handler that rethrows anything but a duplicate-key error
 * @throws {unknown} the original error when it is not a duplicate, or when no winner can be found
 */
const readWinner = (refundId: string) => (error: unknown) => {
    if (!isDuplicateKey(error)) throw error;
    return invoicingRepository.findCreditNoteByRefundId(refundId).then((existing) => {
        if (!existing) throw error;
        return existing;
    });
};

/**
 * Freezes and numbers a credit note for one refund of the invoice already issued on the order. A
 * no-op — `undefined`, never a throw — when no invoice exists to correct: every `succeeded`
 * payment belongs to a `paid` order this module has already invoiced, so the gap only opens on a
 * genuine race (an invoice not yet frozen when the refund lands) or on data older than this
 * module. Either way there is nothing a credit note could reference, so none is issued rather than
 * one pointing at nothing. The number is allocated and the note inserted in one transaction, so a
 * lost race (the same refund credited twice) aborts it and gives the number back.
 *
 * @param input - the refund that was just settled
 * @returns the credit note just issued (or the one this refund already had), or `undefined` when
 *   there was no invoice to correct
 */
export const issueCreditNote = (input: RefundedInput): Promise<CreditNoteDocument | undefined> =>
    findInvoiceForOrder(input.orderId).then((invoice) => {
        if (!invoice) return undefined;

        // Allocated before the transaction: the driver may re-run it, and a retry must reuse the id.
        const _id = new Types.ObjectId();

        return withTransaction((session) =>
            allocateCreditNoteNumber(session).then((number) =>
                invoicingRepository.insertCreditNote(
                    {
                        _id,
                        orderId: invoice.orderId,
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.number,
                        refundId: input.refundId,
                        number,
                        issuedAt: new Date(),
                        currency: invoice.currency,
                        locale: invoice.locale,
                        ...(invoice.orderNumber ? { orderNumber: invoice.orderNumber } : {}),
                        // Decrypted under the invoice's id, re-encrypted under the note's own.
                        ...(invoice.billingAddress
                            ? {
                                  billingAddress: encryptInvoiceParty(
                                      decryptInvoiceParty(
                                          invoice.billingAddress,
                                          'invoice',
                                          invoice._id
                                      ),
                                      'credit-note',
                                      _id
                                  )
                              }
                            : {}),
                        seller: invoice.seller,
                        ...reversedFigures(invoice, input)
                    },
                    session
                )
            )
        ).catch(readWinner(input.refundId));
    });

/**
 * Every credit note for one order, oldest first — `GET /orders/{id}/credit-notes`'s read. Empty for
 * an order never refunded (or with no invoice to reverse).
 * @param orderId - the order to look up
 */
export const findCreditNotesForOrder = (orderId: string): Promise<CreditNoteDocument[]> =>
    invoicingRepository.findCreditNotesByOrderId(orderId);

/**
 * One credit note within an order, or `null` — `GET /orders/{id}/credit-notes/{creditNoteId}`'s
 * read. A credit note belonging to another order is `null` too.
 * @param orderId - the order it must belong to
 * @param creditNoteId - the credit note
 */
export const findCreditNoteForOrderById = (
    orderId: string,
    creditNoteId: string
): Promise<CreditNoteDocument | null> =>
    invoicingRepository.findCreditNoteById(orderId, creditNoteId);
