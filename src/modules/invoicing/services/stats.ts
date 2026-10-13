/**
 * @module
 * Money per bucket for the stats: what was invoiced and what was credited, summed per currency.
 * Invoices and credit notes are the frozen, dated rows (`issuedAt`), which is why every money
 * figure comes from here and not from orders or payments: an order stores no total, and a refund
 * holds one gross amount with no VAT or shipping split.
 *
 * Dates: a document counts on the day it was issued, in the shop's zone. An invoice follows its
 * payment by seconds, a credit note its refund's settlement.
 */

import { NO_MONEY, toMinorUnits, type Money } from '@shared-kernel/money';
import { type ReportWindow } from '@infrastructure/persistence/report';
import { invoicingRepository, type DocumentBucketRow } from '../repository';

/** What one kind of document adds up to in one bucket, in minor units. */
export interface DocumentTotals {
    documents: number;
    /** Lines net of VAT, shipping excluded. */
    goodsNet: Money;
    /** Shipping net of VAT. */
    shippingNet: Money;
    /** VAT, goods and shipping together. */
    tax: Money;
    /** What was actually paid or paid back: VAT and shipping included. */
    gross: Money;
}

/** One bucket of one currency, invoices beside the credit notes issued in it. */
export interface MoneyBucket {
    currency: string;
    bucket: Date;
    invoiced: DocumentTotals;
    credited: DocumentTotals;
}

/** No document at all. */
const NONE: DocumentTotals = {
    documents: 0,
    goodsNet: NO_MONEY,
    shippingNet: NO_MONEY,
    tax: NO_MONEY,
    gross: NO_MONEY
};

/**
 * A repository row as minor units.
 * @param row - the summed decimals
 */
const totalsOf = (row: DocumentBucketRow): DocumentTotals => ({
    documents: row.documents,
    goodsNet: toMinorUnits(row.goodsNet, row.currency),
    shippingNet: toMinorUnits(row.shippingNet, row.currency),
    tax: toMinorUnits(row.tax, row.currency),
    gross: toMinorUnits(row.gross, row.currency)
});

/**
 * Invoices and credit notes issued in a window, per currency and bucket.
 * @param window - the half-open window and the bucket size
 */
export const moneyBuckets = (window: ReportWindow): Promise<MoneyBucket[]> =>
    Promise.all([
        invoicingRepository.sumInvoices(window),
        invoicingRepository.sumCreditNotes(window)
    ]).then(([invoices, creditNotes]) => {
        const merged = new Map<string, MoneyBucket>();
        const cellOf = (row: DocumentBucketRow): MoneyBucket => {
            const key = `${row.currency}|${row.bucket.toISOString()}`;
            const cell = merged.get(key) ?? {
                currency: row.currency,
                bucket: row.bucket,
                invoiced: NONE,
                credited: NONE
            };
            merged.set(key, cell);
            return cell;
        };
        for (const row of invoices) cellOf(row).invoiced = totalsOf(row);
        for (const row of creditNotes) cellOf(row).credited = totalsOf(row);
        return [...merged.values()];
    });
