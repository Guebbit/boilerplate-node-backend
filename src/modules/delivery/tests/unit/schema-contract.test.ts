/**
 * @module
 * The shipment schema's contract. `unique: true` on `orderId` is the same exactly-once device
 * the payment schema uses: one parcel per order, enforced by the database, so a retried dispatch
 * cannot produce a second shipment with a second tracking code for the same goods — two parcels
 * to the customer, one delivery to the courier.
 */

import { shipmentSchema } from '@modules/delivery/model';
import { ShipmentStatus } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    optionsOf,
    refOf,
    requiredPaths,
    typeOf
} from '@tests/schema';

describe('shipmentSchema', () => {
    it('requires the order it belongs to and the code that tracks it', () => {
        // `deliveredAt` is absent until it arrives — its absence IS "in transit", which is why it
        // carries no default.
        expect(requiredPaths(shipmentSchema)).toEqual(['orderId', 'trackingCode']);
    });

    it('allows at most one shipment per order, in the database', () => {
        expect(indexOptionSpecs(shipmentSchema)).toContain('orderId_1: unique=true');
    });

    it('points at the order as a real ObjectId reference', () => {
        expect(typeOf(shipmentSchema, 'orderId')).toBe('ObjectId');
        expect(refOf(shipmentSchema, 'orderId')).toBe('Order');
    });

    it('restricts status to the contract enum and starts shipped', () => {
        // A shipment exists because something was dispatched, so `shipped` is the honest initial
        // state — there is no "pending" parcel.
        expect(enumOf(shipmentSchema, 'status')).toEqual(Object.values(ShipmentStatus));
        expect(defaultOf(shipmentSchema, 'status')).toBe(ShipmentStatus.shipped);
    });

    it('leaves the delivery timestamp unset until delivery', () => {
        expect(defaultOf(shipmentSchema, 'deliveredAt')).toBeUndefined();
    });

    it('keeps timestamps', () => {
        expect(optionsOf(shipmentSchema).timestamps).toBe(true);
    });
});
