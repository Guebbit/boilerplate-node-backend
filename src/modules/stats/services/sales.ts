/**
 * @module
 * Sales over time: money from `invoicing`, orders and units from `orders`, returned units from
 * `returns`, merged by currency and bucket. Each owner answers already grouped, at most a few
 * hundred rows, so this file only merges by key — no big in-memory join.
 */

import { invoicingService } from '@modules/invoicing';
import { orderService, shopCurrency } from '@modules/orders';
import { returnService } from '@modules/returns';
import type { SalesStats } from '@types';
import { addRawFigures, emptyRawFigures, figuresOf, type RawFigures } from './figures';
import type { Period } from './range';

/** Raw figures per currency, then per bucket (keyed by the bucket's ISO instant). */
type ByCurrency = Map<string, Map<string, RawFigures>>;

/**
 * The cell for one currency and bucket, created empty on first touch.
 * @param table - the table being filled
 * @param currency - the ISO-4217 code
 * @param bucket - the bucket's first instant
 */
const cellOf = (table: ByCurrency, currency: string, bucket: Date): RawFigures => {
    const row = table.get(currency) ?? new Map<string, RawFigures>();
    table.set(currency, row);
    const key = bucket.toISOString();
    const cell = row.get(key) ?? emptyRawFigures();
    row.set(key, cell);
    return cell;
};

/**
 * Everything the owners know about one window, merged.
 * @param window - the half-open window and the bucket size
 */
const rawFiguresFor = (window: Period['window']): Promise<ByCurrency> =>
    Promise.all([
        invoicingService.moneyBuckets(window),
        orderService.paidBuckets(window),
        returnService.returnedBuckets(window)
    ]).then(([money, paid, returned]) => {
        const table: ByCurrency = new Map();
        for (const row of money)
            Object.assign(cellOf(table, row.currency, row.bucket), {
                invoicedGoods: row.invoiced.goodsNet,
                invoicedShipping: row.invoiced.shippingNet,
                invoicedTax: row.invoiced.tax,
                invoicedGross: row.invoiced.gross,
                creditedGoods: row.credited.goodsNet,
                creditedShipping: row.credited.shippingNet,
                creditedTax: row.credited.tax,
                creditedGross: row.credited.gross
            });
        for (const row of paid)
            Object.assign(cellOf(table, row.currency, row.bucket), {
                orders: row.orders,
                unitsOrdered: row.units
            });
        for (const row of returned)
            Object.assign(cellOf(table, row.currency, row.bucket), { unitsReversed: row.units });
        return table;
    });

/**
 * Add every bucket of one currency into a single total.
 * @param row - the currency's buckets
 */
const totalOf = (row: Map<string, RawFigures> | undefined): RawFigures => {
    let total = emptyRawFigures();
    for (const cell of row?.values() ?? []) total = addRawFigures(total, cell);
    return total;
};

/**
 * The sales figures of a period: totals, the previous period's totals, and every bucket.
 *
 * The shop's own currency is always present, so an empty period reads as zeros rather than as
 * nothing; any other currency appears only when something was sold in it.
 *
 * @param period - the resolved period
 */
export const getSalesStats = (period: Period): Promise<SalesStats> =>
    Promise.all([rawFiguresFor(period.window), rawFiguresFor(period.previous)]).then(
        ([current, previous]) => {
            const currencies = new Set([shopCurrency(), ...current.keys(), ...previous.keys()]);
            return {
                period: period.echo,
                currencies: [...currencies].toSorted().map((currency) => {
                    const row = current.get(currency);
                    return {
                        currency,
                        totals: figuresOf(totalOf(row), currency),
                        previous: figuresOf(totalOf(previous.get(currency)), currency),
                        buckets: period.bucketStarts.map((start) => ({
                            start: start.toISOString(),
                            figures: figuresOf(
                                row?.get(start.toISOString()) ?? emptyRawFigures(),
                                currency
                            )
                        }))
                    };
                })
            };
        }
    );
