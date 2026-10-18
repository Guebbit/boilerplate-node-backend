/**
 * @module
 * Turning each series' atomic yearly counter into its printed number — `{year}-{sequence}`, the
 * same format as `orders/services/order-numbering.ts` (`formatYearlySequence`). Unlike order numbers, these series are
 * gap-free: the caller allocates inside the transaction that inserts the document, so a lost race
 * aborts and gives the number back (VAT Directive Art. 226(2); a credit note is an invoice in law,
 * Art. 219). Two independent counters, so a credit note never borrows a number from the invoice
 * series it corrects.
 */

import type { ClientSession } from 'mongoose';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { formatYearlySequence } from '@infrastructure/persistence/yearly-counter';
import { yearInZone } from '@modules/orders';
import { invoicingRepository } from '../repository';
import { shopTimezone } from '@modules/shop';

/**
 * Allocates and formats the next invoice number for the shop-calendar year of `issuedAt`
 * (`NODE_SHOP_TIMEZONE`). Called once per order, from the `ORDER_STATUS_CHANGED` listener that
 * issues its invoice — never again for the same order, so a re-downloaded PDF always shows the
 * same number. The year comes from the very instant stored as `issuedAt`, so number and date
 * cannot disagree.
 * @param issuedAt - the instant the document will carry as its issue date
 * @param session - the transaction that inserts the invoice. Required: a number taken outside it
 *   is a legal gap if the insert then fails
 * @returns the formatted invoice number for a new invoice
 * @internal The step beneath the issuing path, which decides whether an invoice may be issued: a
 *   number taken outside that path is a legal gap; it never leaves the barrel.
 */
export const allocateInvoiceNumber = (issuedAt: Date, session: ClientSession): Promise<string> => {
    const year = yearInZone(issuedAt, shopTimezone());
    return invoicingRepository
        .incrementInvoiceNumberCounter(year, session)
        .then((sequence) => formatYearlySequence(year, sequence));
};

/**
 * Allocates and formats the next credit-note number for the shop-calendar year of `issuedAt` —
 * its own series, independent from {@link allocateInvoiceNumber}'s.
 * @param issuedAt - the instant the document will carry as its issue date
 * @param session - the transaction that inserts the credit note. Required, for the same reason
 * @returns the formatted credit-note number for a new credit note
 * @internal The step beneath the issuing path, for the same reason as
 *   {@link allocateInvoiceNumber}; it never leaves the barrel.
 */
export const allocateCreditNoteNumber = (
    issuedAt: Date,
    session: ClientSession
): Promise<string> => {
    const year = yearInZone(issuedAt, shopTimezone());
    return invoicingRepository
        .incrementCreditNoteNumberCounter(year, session)
        .then((sequence) => formatYearlySequence(year, sequence));
};

/**
 * What a lost race reads back: the document the winner wrote. A second writer for one order (or
 * one refund) aborts on the unique index and gives its number back; this reads what the winner
 * issued instead, so the caller still gets a document. One home, since both issuing paths must
 * recover the same way.
 * @param find - reads the winner's document by the key both writers shared
 * @returns a `catch` handler that rethrows anything but a duplicate-key error
 * @throws {unknown} the original error when it is not a duplicate, or when no winner can be found
 */
export const readWinner =
    <TDocument>(find: () => Promise<TDocument | null>) =>
    (error: unknown): Promise<TDocument> => {
        if (!isDuplicateKey(error)) throw error;
        return find().then((existing) => {
            // Unreachable outside a corrupted unique index: the duplicate key error IS the
            // existing row's own guarantee that a read right behind it finds something.
            if (!existing) throw error;
            return existing;
        });
    };
