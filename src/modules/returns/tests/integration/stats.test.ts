/**
 * @module
 * The grouped reads `stats` composes from returns: units that came back, per shop day, per product
 * and for one product. The subject is which returns count (goods received, not merely asked for)
 * and which day they land on.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { returnModel } from '../../model';
import { returnedBuckets, returnedByProduct, returnedSeries } from '../../services/stats';

setupTestDb();

const shoes = new Types.ObjectId();
const hats = new Types.ObjectId();

/** The window the cases read: 9 to 12 March 2026 in Rome (+01:00), by day. */
const window = {
    from: new Date('2026-03-08T23:00:00Z'),
    to: new Date('2026-03-12T23:00:00Z'),
    interval: 'day' as const,
    timeZone: 'Europe/Rome'
};

/**
 * One return.
 * @param status - where it stands
 * @param receivedAt - when the goods arrived, if they did
 * @param lines - product and units
 */
const seedReturn = (
    status: 'requested' | 'received' | 'closed',
    receivedAt: string | undefined,
    lines: [Types.ObjectId, number][]
) =>
    returnModel.create({
        orderId: new Types.ObjectId(),
        orderNumber: '2026-000001',
        currency: 'EUR',
        status,
        reason: 'withdrawal',
        returnPostage: 'consumer',
        lines: lines.map(([productId, quantity]) => ({
            productId,
            quantity,
            title: 'Item',
            unitPrice: 10
        })),
        ...(receivedAt ? { receivedAt: new Date(receivedAt) } : {})
    });

describe('returned units', () => {
    beforeEach(async () => {
        // 23:30 UTC on the 10th is already the 11th in Rome.
        await seedReturn('received', '2026-03-10T23:30:00Z', [
            [shoes, 2],
            [hats, 1]
        ]);
        await seedReturn('closed', '2026-03-10T10:00:00Z', [[shoes, 1]]);
        // Asked for but not received, and received outside the window: neither counts.
        await seedReturn('requested', undefined, [[shoes, 9]]);
        await seedReturn('received', '2026-02-01T10:00:00Z', [[shoes, 9]]);
    });

    it('buckets received units by shop day', async () => {
        const rows = await returnedBuckets(window);

        const byDay = Object.fromEntries(rows.map((row) => [row.bucket.toISOString(), row.units]));
        expect(byDay).toEqual({
            '2026-03-09T23:00:00.000Z': 1,
            '2026-03-10T23:00:00.000Z': 3
        });
    });

    it('totals per product and for one product over time', async () => {
        const byProduct = await returnedByProduct(window);
        const series = await returnedSeries(String(shoes), window);

        expect(Object.fromEntries(byProduct.map((row) => [row.productId, row.units]))).toEqual({
            [String(shoes)]: 3,
            [String(hats)]: 1
        });
        expect(series.map((row) => row.units).toSorted()).toEqual([1, 2]);
    });
});
