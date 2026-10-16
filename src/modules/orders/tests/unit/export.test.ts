/**
 * @module
 * One order as one CSV row: every column named, dates as UTC ISO text whether the row came from
 * the store (a `Date`) or the wire (a string), and an unpaid order's empty cells empty.
 */
import { ORDER_CSV_COLUMNS, toOrderCsvRow, type OrderCsvSource } from '../../domain';

/** A paid, shipped, never-returned order of two lines and three units. */
const order: OrderCsvSource = {
    orderNumber: '2026-000042',
    status: 'delivered',
    paymentStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    returnStatus: 'none',
    email: 'buyer@example.com',
    totalItems: 2,
    totalQuantity: 3,
    totalPrice: 59.9,
    currency: 'EUR',
    paymentMethod: 'card',
    createdAt: new Date('2026-05-01T09:30:00Z'),
    paidAt: '2026-05-01T09:35:00.000Z'
};

describe('toOrderCsvRow', () => {
    it('fills exactly the columns the file declares, in cells a CSV writer takes as they are', () => {
        const row = toOrderCsvRow(order);

        expect(Object.keys(row)).toEqual([...ORDER_CSV_COLUMNS]);
        // Key order is not compared by `toEqual` below, so the file's column order is pinned here.
        expect(ORDER_CSV_COLUMNS).toEqual([
            'createdAt',
            'orderNumber',
            'status',
            'paymentStatus',
            'fulfillmentStatus',
            'returnStatus',
            'email',
            'lines',
            'units',
            'total',
            'currency',
            'paymentMethod',
            'paidAt'
        ]);
        expect(row).toEqual({
            createdAt: '2026-05-01T09:30:00.000Z',
            orderNumber: '2026-000042',
            status: 'delivered',
            paymentStatus: 'paid',
            fulfillmentStatus: 'fulfilled',
            returnStatus: 'none',
            email: 'buyer@example.com',
            lines: 2,
            units: 3,
            total: 59.9,
            currency: 'EUR',
            paymentMethod: 'card',
            paidAt: '2026-05-01T09:35:00.000Z'
        });
    });

    it('leaves the cells of an unpaid order with no method empty rather than writing "undefined"', () => {
        const row = toOrderCsvRow({
            ...order,
            paymentStatus: 'unpaid',
            paymentMethod: undefined,
            paidAt: undefined
        });

        expect(row.paymentMethod).toBe('');
        expect(row.paidAt).toBe('');
    });
});
