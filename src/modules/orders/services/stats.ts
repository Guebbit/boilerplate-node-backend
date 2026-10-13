/**
 * @module
 * The grouped reads `stats` composes: orders and units per bucket, products, categories, customers,
 * the cancellation cohort and the open pipeline. Each answers a few hundred rows at most, already
 * grouped, so the composer only merges by key.
 *
 * Counted: orders the shop has not deleted, dated by `paidAt` (a sale) or `createdAt` (the cohort).
 * Deleted orders drop out of every count here; their money stays, since the invoice stays.
 */

import type { PipelineStage } from 'mongoose';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { bucketOf, type ReportWindow } from '@infrastructure/persistence/report';
import { toMinorUnits, type Money } from '@shared-kernel/money';
import { orderRepository } from '../repository';

/** Orders paid in a window: a `$match` on `paidAt`, live orders only. */
const paidIn = ({ from, to }: ReportWindow): PipelineStage.Match => ({
    $match: { paidAt: { $gte: from, $lt: to }, deletedAt: null }
});

/**
 * One line's net-of-VAT amount as a decimal: quantity × price ÷ (1 + the line's frozen rate).
 * The price includes VAT, so the rate is taken off here, the way `orders/domain/tax.ts` does.
 */
const LINE_NET = {
    $multiply: [
        { $toDecimal: '$items.quantity' },
        {
            $divide: [
                '$items.product.price',
                { $add: [{ $toDecimal: 1 }, { $toDecimal: '$items.product.taxRate' }] }
            ]
        }
    ]
};

/** Orders and units paid in one bucket of one currency. */
export interface PaidBucket {
    currency: string;
    bucket: Date;
    orders: number;
    units: number;
}

/**
 * Orders paid and units on them, per currency and bucket.
 * @param window - the half-open window and the bucket size
 */
export const paidBuckets = (window: ReportWindow): Promise<PaidBucket[]> =>
    orderRepository
        .aggregate<{
            _id: { currency: string; bucket: Date };
            orders: number;
            units: number;
        }>([
            paidIn(window),
            {
                $group: {
                    _id: { currency: '$currency', bucket: bucketOf('$paidAt', window) },
                    orders: { $sum: 1 },
                    units: { $sum: { $sum: '$items.quantity' } }
                }
            }
        ])
        .then((rows) =>
            rows.map((row) => ({
                currency: row._id.currency,
                bucket: row._id.bucket,
                orders: row.orders,
                units: row.units
            }))
        );

/** One product's sales over a window, in one currency. */
export interface ProductTotal {
    currency: string;
    productId: string;
    title: string;
    units: number;
    netSales: Money;
}

/**
 * The products that sold most by net sales, from the frozen order lines.
 * @param window - the half-open window
 * @param limit - how many products
 */
export const productTotals = (window: ReportWindow, limit: number): Promise<ProductTotal[]> =>
    orderRepository
        .aggregate<{
            _id: { currency: string; productId: unknown };
            title: string;
            units: number;
            netSales: unknown;
        }>([
            paidIn(window),
            { $unwind: '$items' },
            {
                $group: {
                    _id: { currency: '$currency', productId: '$items.product._id' },
                    title: { $first: '$items.product.title' },
                    units: { $sum: '$items.quantity' },
                    netSales: { $sum: LINE_NET }
                }
            },
            { $sort: { netSales: -1, '_id.productId': 1 } },
            { $limit: limit }
        ])
        .then((rows) =>
            rows.map((row) => ({
                currency: row._id.currency,
                productId: String(row._id.productId),
                title: row.title,
                units: row.units,
                netSales: toMinorUnits(row.netSales, row._id.currency)
            }))
        );

/** One category's sales over a window, in one currency. */
export interface CategoryTotal {
    currency: string;
    category: string;
    units: number;
    netSales: Money;
}

/**
 * Net sales per category, from the categories each line froze. A product in two categories counts
 * in both, so the rows do not add up to the total.
 * @param window - the half-open window
 */
export const categoryTotals = (window: ReportWindow): Promise<CategoryTotal[]> =>
    orderRepository
        .aggregate<{
            _id: { currency: string; category: string };
            units: number;
            netSales: unknown;
        }>([
            paidIn(window),
            { $unwind: '$items' },
            { $unwind: '$items.product.categories' },
            {
                $group: {
                    _id: { currency: '$currency', category: '$items.product.categories' },
                    units: { $sum: '$items.quantity' },
                    netSales: { $sum: LINE_NET }
                }
            },
            { $sort: { netSales: -1, '_id.category': 1 } }
        ])
        .then((rows) =>
            rows.map((row) => ({
                currency: row._id.currency,
                category: row._id.category,
                units: row.units,
                netSales: toMinorUnits(row.netSales, row._id.currency)
            }))
        );

/** One product's units per bucket, and its title as the orders froze it. */
export interface ProductSeriesRead {
    title?: string;
    buckets: { bucket: Date; units: number }[];
}

/**
 * Units of one product per bucket.
 * @param productId - the catalogue product
 * @param window - the half-open window and the bucket size
 */
export const productSeries = (
    productId: string,
    window: ReportWindow
): Promise<ProductSeriesRead> =>
    orderRepository
        .aggregate<{ _id: Date; units: number; title: string }>([
            { $match: { ...paidIn(window).$match, 'items.product._id': toObjectId(productId) } },
            { $unwind: '$items' },
            { $match: { 'items.product._id': toObjectId(productId) } },
            {
                $group: {
                    _id: bucketOf('$paidAt', window),
                    units: { $sum: '$items.quantity' },
                    title: { $first: '$items.product.title' }
                }
            }
        ])
        .then((rows) => ({
            ...(rows.length > 0 ? { title: rows[0].title } : {}),
            buckets: rows.map((row) => ({ bucket: row._id, units: row.units }))
        }));

/**
 * How many accounts paid in the window, and how many of those paid for the first time in it.
 * Accounts only, never email: every erased account shares one placeholder address.
 * @param window - the half-open window
 */
export const customerCounts = ({
    from,
    to
}: ReportWindow): Promise<{ customers: number; newCustomers: number }> =>
    orderRepository
        .aggregate<{ customers: number; newCustomers: number }>([
            // Everything up to the window's end, so each account's first paid order is found.
            { $match: { paidAt: { $lt: to }, userId: { $ne: null }, deletedAt: null } },
            {
                $group: {
                    _id: '$userId',
                    first: { $min: '$paidAt' },
                    last: { $max: '$paidAt' }
                }
            },
            { $match: { last: { $gte: from } } },
            {
                $group: {
                    _id: null,
                    customers: { $sum: 1 },
                    newCustomers: { $sum: { $cond: [{ $gte: ['$first', from] }, 1, 0] } }
                }
            }
        ])
        .then((rows) => ({
            customers: rows.at(0)?.customers ?? 0,
            newCustomers: rows.at(0)?.newCustomers ?? 0
        }));

/**
 * Orders placed in the window, and how many of those ended cancelled: a cohort, since there is no
 * cancel date to bucket by.
 * @param window - the half-open window
 */
export const cancellationCohort = ({
    from,
    to
}: ReportWindow): Promise<{ placed: number; cancelled: number }> =>
    orderRepository
        .aggregate<{ placed: number; cancelled: number }>([
            { $match: { createdAt: { $gte: from, $lt: to }, deletedAt: null } },
            {
                $group: {
                    _id: null,
                    placed: { $sum: 1 },
                    cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
                }
            }
        ])
        .then((rows) => ({
            placed: rows.at(0)?.placed ?? 0,
            cancelled: rows.at(0)?.cancelled ?? 0
        }));

/** Bank transfers still owed, in one currency. */
export interface AwaitingTransfers {
    currency: string;
    count: number;
    amount: Money;
    nearestPayBy?: Date;
}

/** What is waiting right now. */
export interface PipelineRead {
    awaitingTransfers: AwaitingTransfers[];
    paidNotShipped: number;
}

/** An order's total as a decimal: every line's quantity × price, plus shipping (VAT included). */
const ORDER_TOTAL = {
    $add: [
        {
            $sum: {
                $map: {
                    input: '$items',
                    in: {
                        $multiply: [{ $toDecimal: '$$this.quantity' }, '$$this.product.price']
                    }
                }
            }
        },
        { $ifNull: ['$shippingCost', 0] }
    ]
};

/**
 * A snapshot of the open pipeline: transfers awaiting money (count, amount, the nearest `payBy`)
 * and paid orders not yet handed to a carrier.
 */
export const pipeline = (): Promise<PipelineRead> =>
    orderRepository
        .aggregate<{
            transfers: {
                _id: string;
                count: number;
                amount: unknown;
                nearest?: Date;
            }[];
            paid: { n: number }[];
        }>([
            {
                $facet: {
                    transfers: [
                        {
                            $match: {
                                status: 'pending',
                                paymentMethod: 'bank_transfer',
                                deletedAt: null
                            }
                        },
                        {
                            $group: {
                                _id: '$currency',
                                count: { $sum: 1 },
                                amount: { $sum: ORDER_TOTAL },
                                nearest: { $min: '$payBy' }
                            }
                        }
                    ],
                    paid: [
                        { $match: { status: { $in: ['paid', 'processing'] }, deletedAt: null } },
                        { $count: 'n' }
                    ]
                }
            }
        ])
        .then(([facet]) => ({
            awaitingTransfers: facet.transfers.map((row) => ({
                currency: row._id,
                count: row.count,
                amount: toMinorUnits(row.amount, row._id),
                ...(row.nearest ? { nearestPayBy: row.nearest } : {})
            })),
            paidNotShipped: facet.paid.at(0)?.n ?? 0
        }));
