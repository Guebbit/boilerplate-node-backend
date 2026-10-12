/**
 * @module
 * Turning each series' atomic yearly counter into its printed number — `{year}-{sequence}`, the
 * same format as `orders/services/order-numbering.ts`. Unlike order numbers, these series are
 * gap-free: the caller allocates inside the transaction that inserts the document, so a lost race
 * aborts and gives the number back (VAT Directive Art. 226(2); a credit note is an invoice in law,
 * Art. 219). Two independent counters, so a credit note never borrows a number from the invoice
 * series it corrects.
 */

import type { ClientSession } from 'mongoose';
import { shopTimezone, yearInZone } from '@modules/orders';
import { invoicingRepository } from '../repository';

/** How wide the sequence portion of a number is padded, e.g. `000041` — matches `orders`' own. */
const SEQUENCE_WIDTH = 6;

/** `{year}-{sequence}`, zero-padded to {@link SEQUENCE_WIDTH} digits. */
const formatNumber = (year: number, sequence: number): string =>
    `${year}-${String(sequence).padStart(SEQUENCE_WIDTH, '0')}`;

/**
 * Allocates and formats the next invoice number for the shop-calendar year of `issuedAt`
 * (`NODE_SHOP_TIMEZONE`). Called once per order, from the `ORDER_STATUS_CHANGED` listener that
 * issues its invoice — never again for the same order, so a re-downloaded PDF always shows the
 * same number. The year comes from the very instant stored as `issuedAt`, so number and date
 * cannot disagree.
 * @param issuedAt - the instant the document will carry as its issue date
 * @param session - the transaction that inserts the invoice
 * @returns the formatted invoice number for a new invoice
 */
export const allocateInvoiceNumber = (issuedAt: Date, session?: ClientSession): Promise<string> => {
    const year = yearInZone(issuedAt, shopTimezone());
    return invoicingRepository
        .incrementInvoiceNumberCounter(year, session)
        .then((sequence) => formatNumber(year, sequence));
};

/**
 * Allocates and formats the next credit-note number for the shop-calendar year of `issuedAt` —
 * its own series, independent from {@link allocateInvoiceNumber}'s.
 * @param issuedAt - the instant the document will carry as its issue date
 * @param session - the transaction that inserts the credit note
 * @returns the formatted credit-note number for a new credit note
 */
export const allocateCreditNoteNumber = (
    issuedAt: Date,
    session?: ClientSession
): Promise<string> => {
    const year = yearInZone(issuedAt, shopTimezone());
    return invoicingRepository
        .incrementCreditNoteNumberCounter(year, session)
        .then((sequence) => formatNumber(year, sequence));
};
