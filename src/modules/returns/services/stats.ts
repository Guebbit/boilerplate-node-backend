/**
 * @module
 * Goods that came back, for the stats. A return counts on the day its goods were received, the same
 * moment the stock went back on sale.
 */

import { bucketOf, type ReportWindow } from '@infrastructure/persistence/report';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { returnRepository } from '../repository';

/** Units received back in one bucket of one currency. */
export interface ReturnedBucket {
    currency: string;
    bucket: Date;
    units: number;
}

/**
 * Units received back per currency and bucket; the window's bucket size sets the grain.
 * @param window - the half-open window and the bucket size
 */
export const returnedBuckets = (window: ReportWindow): Promise<ReturnedBucket[]> =>
    returnRepository
        .sumReceived<{ _id: { currency: string; bucket: Date }; units: number }>(window, {
            _id: { currency: '$currency', bucket: bucketOf('$receivedAt', window) },
            units: { $sum: '$lines.quantity' }
        })
        .then((rows) =>
            rows.map((row) => ({
                currency: row._id.currency,
                bucket: row._id.bucket,
                units: row.units
            }))
        );

/**
 * Units received back per product, summed over every currency and bucket of the window.
 * @param window - the half-open window
 */
export const returnedByProduct = (
    window: ReportWindow
): Promise<{ productId: string; units: number }[]> =>
    returnRepository
        .sumReceived<{ _id: unknown; units: number }>(window, {
            _id: '$lines.productId',
            units: { $sum: '$lines.quantity' }
        })
        .then((rows) => rows.map((row) => ({ productId: String(row._id), units: row.units })));

/**
 * Units of one product received back, per bucket, filtered inside the aggregation.
 * @param productId - the catalogue product
 * @param window - the half-open window and the bucket size
 */
export const returnedSeries = (
    productId: string,
    window: ReportWindow
): Promise<{ bucket: Date; units: number }[]> =>
    returnRepository
        .sumReceived<{
            _id: Date;
            units: number;
        }>(
            window,
            { _id: bucketOf('$receivedAt', window), units: { $sum: '$lines.quantity' } },
            toObjectId(productId)
        )
        .then((rows) => rows.map((row) => ({ bucket: row._id, units: row.units })));
