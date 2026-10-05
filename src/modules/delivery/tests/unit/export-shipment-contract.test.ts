/**
 * @module
 * The shipment an account export carries, read through the generated response schema: a parcel
 * of a method that carries no tracking has no `trackingCode`, and the export must still be a
 * valid `DownloadAccountExport200Response`. The schema is the one the paired frontend validates
 * a downloaded export against.
 */

import { DownloadAccountExport200Response } from '@api/schemas.zod';

/** The schema of one shipment inside an export. */
const exportShipment = DownloadAccountExport200Response.shape.shipments.element;

/** A delivered parcel with only what every shipment has. */
const untracked = {
    id: '65dcdec2b18ad5e4bd597f01',
    orderId: '65dcdec2b18ad5e4bd597f02',
    status: 'delivered'
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

    it('still needs its order and status', () => {
        expect(exportShipment.safeParse({ id: untracked.id }).success).toBe(false);
    });
});
