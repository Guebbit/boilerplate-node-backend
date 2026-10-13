/**
 * @module
 * The sales dashboard's tables and snapshots: products, categories, one product over time, the
 * payments mix, the operations rates, customers and the open pipeline. Each is one owner read, or
 * two merged by key.
 */

import { invoicingService } from '@modules/invoicing';
import { addMoney, toDecimalAmount } from '@shared-kernel/money';
import { orderService } from '@modules/orders';
import { paymentService } from '@modules/payments';
import { returnService } from '@modules/returns';
import type {
    CategoryStats,
    CustomerStats,
    OperationsStats,
    PaymentMix,
    PipelineStats,
    ProductSeries,
    ProductStats
} from '@types';
import { rateOf } from './figures';
import type { Period } from './range';

/**
 * The top products of a period, with the units that came back.
 * @param period - the resolved period
 * @param limit - how many products
 */
export const getProductStats = (period: Period, limit: number): Promise<ProductStats> =>
    Promise.all([
        orderService.productTotals(period.window, limit),
        returnService.returnedByProduct(period.window)
    ]).then(([sold, returned]) => {
        const reversed = new Map(returned.map((row) => [row.productId, row.units]));
        return {
            period: period.echo,
            products: sold.map((row) => {
                const unitsReversed = reversed.get(row.productId) ?? 0;
                return {
                    productId: row.productId,
                    title: row.title,
                    currency: row.currency,
                    unitsOrdered: row.units,
                    unitsReversed,
                    netUnits: row.units - unitsReversed,
                    netSales: toDecimalAmount(row.netSales, row.currency)
                };
            })
        };
    });

/**
 * Net sales per category.
 * @param period - the resolved period
 */
export const getCategoryStats = (period: Period): Promise<CategoryStats> =>
    orderService.categoryTotals(period.window).then((rows) => ({
        period: period.echo,
        categories: rows.map((row) => ({
            category: row.category,
            currency: row.currency,
            unitsOrdered: row.units,
            netSales: toDecimalAmount(row.netSales, row.currency)
        }))
    }));

/**
 * One product's units over time, every bucket present.
 * @param period - the resolved period
 * @param productId - the catalogue product
 */
export const getProductSeries = (period: Period, productId: string): Promise<ProductSeries> =>
    Promise.all([
        orderService.productSeries(productId, period.window),
        returnService.returnedSeries(productId, period.window)
    ]).then(([sold, returned]) => {
        const ordered = new Map(sold.buckets.map((row) => [row.bucket.toISOString(), row.units]));
        const reversed = new Map(returned.map((row) => [row.bucket.toISOString(), row.units]));
        return {
            period: period.echo,
            productId,
            ...(sold.title === undefined ? {} : { title: sold.title }),
            buckets: period.bucketStarts.map((start) => ({
                start: start.toISOString(),
                unitsOrdered: ordered.get(start.toISOString()) ?? 0,
                unitsReversed: reversed.get(start.toISOString()) ?? 0
            }))
        };
    });

/**
 * Payments that took money, by method and provider.
 * @param period - the resolved period
 */
export const getPaymentMix = (period: Period): Promise<PaymentMix> =>
    paymentService.methodMix(period.window).then((rows) => ({
        period: period.echo,
        rows: rows.map((row) => ({
            method: row.method,
            provider: row.provider,
            currency: row.currency,
            payments: row.payments,
            amount: toDecimalAmount(row.amount, row.currency)
        }))
    }));

/**
 * The three rates: cancellation (a cohort), returns, refunds.
 * @param period - the resolved period
 */
export const getOperationsStats = (period: Period): Promise<OperationsStats> =>
    Promise.all([
        orderService.cancellationCohort(period.window),
        orderService.paidBuckets(period.window),
        returnService.returnedBuckets(period.window),
        invoicingService.moneyBuckets(period.window)
    ]).then(([cohort, paid, returned, money]) => {
        const unitsOrdered = paid.reduce((sum, row) => sum + row.units, 0);
        const unitsReturned = returned.reduce((sum, row) => sum + row.units, 0);
        const currencies = [...new Set(money.map((row) => row.currency))].toSorted();
        return {
            period: period.echo,
            cancellation: { ...cohort, rate: rateOf(cohort.cancelled, cohort.placed) },
            returns: { unitsOrdered, unitsReturned, rate: rateOf(unitsReturned, unitsOrdered) },
            refunds: currencies.map((currency) => {
                const rows = money.filter((row) => row.currency === currency);
                const invoiced = addMoney(...rows.map((row) => row.invoiced.gross));
                const credited = addMoney(...rows.map((row) => row.credited.gross));
                return {
                    currency,
                    invoiced: toDecimalAmount(invoiced, currency),
                    credited: toDecimalAmount(credited, currency),
                    rate: rateOf(credited, invoiced)
                };
            })
        };
    });

/**
 * New and returning customers, by account.
 * @param period - the resolved period
 */
export const getCustomerStats = (period: Period): Promise<CustomerStats> =>
    orderService.customerCounts(period.window).then(({ customers, newCustomers }) => ({
        period: period.echo,
        customers,
        newCustomers,
        returningCustomers: customers - newCustomers,
        returningRate: rateOf(customers - newCustomers, customers)
    }));

/** What is waiting right now: transfers owed and paid orders not yet shipped. */
export const getPipelineStats = (): Promise<PipelineStats> =>
    orderService.pipeline().then((snapshot) => ({
        paidNotShipped: snapshot.paidNotShipped,
        awaitingTransfers: snapshot.awaitingTransfers.map((row) => ({
            currency: row.currency,
            count: row.count,
            amount: toDecimalAmount(row.amount, row.currency),
            ...(row.nearestPayBy ? { nearestPayBy: row.nearestPayBy.toISOString() } : {})
        }))
    }));
