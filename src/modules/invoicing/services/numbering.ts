/**
 * @module
 * Turning each series' atomic yearly counter into its printed number — `{year}-{sequence}`, the
 * same format and the same reasoning `orders/services/order-numbering.ts` already documents: a
 * gap (a losing writer's number, a failed insert right behind it) is an acceptable, documented
 * outcome, never a bug to roll back for. Two independent counters, so a credit note can never
 * borrow a gap — or a number — from the invoice series it corrects.
 */

import { invoicingRepository } from '../repository';

/** How wide the sequence portion of a number is padded, e.g. `000041` — matches `orders`' own. */
const SEQUENCE_WIDTH = 6;

/** `{year}-{sequence}`, zero-padded to {@link SEQUENCE_WIDTH} digits. */
const formatNumber = (year: number, sequence: number): string =>
    `${year}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`;

/**
 * Allocates and formats the next invoice number for the current UTC year. Called once per order,
 * from the `ORDER_STATUS_CHANGED` listener that issues its invoice — never again for the same
 * order, so a re-downloaded PDF always shows the same number.
 * @returns the formatted invoice number for a new invoice
 */
export const allocateInvoiceNumber = (): Promise<string> => {
    const year = new Date().getUTCFullYear();
    return invoicingRepository
        .incrementInvoiceNumberCounter(year)
        .then((sequence) => formatNumber(year, sequence));
};

/**
 * Allocates and formats the next credit-note number for the current UTC year — its own series,
 * independent from {@link allocateInvoiceNumber}'s.
 * @returns the formatted credit-note number for a new credit note
 */
export const allocateCreditNoteNumber = (): Promise<string> => {
    const year = new Date().getUTCFullYear();
    return invoicingRepository
        .incrementCreditNoteNumberCounter(year)
        .then((sequence) => formatNumber(year, sequence));
};
