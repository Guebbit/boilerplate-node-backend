/**
 * @module
 * What an account export carries of the goods, read through the generated response schema: a
 * shipment of a method that carries no tracking has no `trackingCode`, a fulfillment order carries
 * its hold note when staff wrote one (staff's assessment of a person is that person's data), and the
 * export must still be a valid `DownloadAccountExport200Response`. The schema is the one the paired
 * frontend validates a downloaded export against.
 */

import { DownloadAccountExport200Response } from '@api/schemas.zod';

/** The schema of one shipment inside an export. */
const exportShipment = DownloadAccountExport200Response.shape.shipments.element;

/** The schema of one fulfillment order inside an export. */
const exportFulfillmentOrder = DownloadAccountExport200Response.shape.fulfillmentOrders.element;

/** A delivered shipment with only what every shipment has. */
const untracked = {
    id: '65dcdec2b18ad5e4bd597f01',
    orderId: '65dcdec2b18ad5e4bd597f02',
    fulfillmentOrderId: '65dcdec2b18ad5e4bd597f03',
    number: 1,
    status: 'delivered',
    lines: [{ productId: '65dcdec2b18ad5e4bd597f04', title: 'Mug', quantity: 1 }],
    shippedAt: '2026-05-01T10:00:00.000Z'
};

describe('an export’s shipment', () => {
    it('is valid without a tracking code, for a method that carries none', () => {
        expect(exportShipment.safeParse(untracked).success).toBe(true);
    });

    it('is valid with a tracking code', () => {
        expect(exportShipment.safeParse({ ...untracked, trackingCode: 'TRK-1' }).success).toBe(
            true
        );
    });

    it('still needs its order, status and what is in it', () => {
        expect(exportShipment.safeParse({ id: untracked.id }).success).toBe(false);
        expect(exportShipment.safeParse({ ...untracked, lines: undefined }).success).toBe(false);
    });

    it('carries no actions: they are the caller’s, not the record', () => {
        expect(
            exportShipment.safeParse({
                ...untracked,
                actions: { deliver: true, editTracking: true }
            }).success
        ).toBe(false);
    });
});

describe('an export’s fulfillment order', () => {
    const closed = {
        id: '65dcdec2b18ad5e4bd597f05',
        orderId: untracked.orderId,
        number: 1,
        kind: 'physical',
        status: 'closed',
        lines: [
            {
                productId: '65dcdec2b18ad5e4bd597f04',
                title: 'Mug',
                quantity: 1,
                shippedQuantity: 1,
                cancelledQuantity: 0,
                remaining: 0
            }
        ]
    };

    it('is valid with its lines, and with the dates and the hold reason it may carry', () => {
        expect(exportFulfillmentOrder.safeParse(closed).success).toBe(true);
        expect(
            exportFulfillmentOrder.safeParse({
                ...closed,
                status: 'on_hold',
                holdReason: 'awaiting_stock',
                agreedAt: '2026-12-12T00:00:00.000Z',
                expectedAt: '2026-12-12T00:00:00.000Z'
            }).success
        ).toBe(true);
    });

    it('carries staff’s hold note, and refuses a staff id beside it', () => {
        expect(exportFulfillmentOrder.safeParse({ ...closed, holdNote: 'x' }).success).toBe(true);
        expect(exportFulfillmentOrder.safeParse({ ...closed, heldBy: 'u1' }).success).toBe(false);
    });
});
