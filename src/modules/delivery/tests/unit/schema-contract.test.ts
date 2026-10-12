/**
 * @module
 * The two schemas' contract. `{ orderId, number }` unique is the same exactly-once device the
 * payment schema uses: a fulfillment order made twice (a retried listener, a read racing it) and a
 * shipment taking a number another already took are both refused by the database, not by a hope.
 */

import { fulfillmentOrderSchema, shipmentSchema } from '@modules/delivery/model';
import {
    FulfillmentHoldReason,
    FulfillmentOrderKind,
    FulfillmentOrderStatus,
    ShipmentStatus
} from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    optionsOf,
    refOf,
    requiredPaths,
    typeOf
} from '@tests/schema';

describe('fulfillmentOrderSchema', () => {
    it('requires the order, its number, its kind, its lines and its revision', () => {
        expect(requiredPaths(fulfillmentOrderSchema)).toEqual([
            'kind',
            'lines',
            'number',
            'orderId',
            'revision'
        ]);
    });

    it('allows one fulfillment order per number per order, in the database', () => {
        expect(indexOptionSpecs(fulfillmentOrderSchema)).toContain(
            'orderId_1_number_1: unique=true'
        );
    });

    it('points at the order as a real ObjectId reference', () => {
        expect(typeOf(fulfillmentOrderSchema, 'orderId')).toBe('ObjectId');
        expect(refOf(fulfillmentOrderSchema, 'orderId')).toBe('Order');
    });

    it('closes its vocabularies to the contract’s, and starts open', () => {
        expect(enumOf(fulfillmentOrderSchema, 'status')).toEqual(
            Object.values(FulfillmentOrderStatus)
        );
        expect(defaultOf(fulfillmentOrderSchema, 'status')).toBe(FulfillmentOrderStatus.open);
        expect(enumOf(fulfillmentOrderSchema, 'kind')).toEqual(Object.values(FulfillmentOrderKind));
        expect(enumOf(fulfillmentOrderSchema, 'holdReason')).toEqual(
            Object.values(FulfillmentHoldReason)
        );
    });

    it('starts its revision at zero, so the first claim has something to match', () => {
        expect(defaultOf(fulfillmentOrderSchema, 'revision')).toBe(0);
    });

    it('keeps timestamps', () => {
        expect(optionsOf(fulfillmentOrderSchema).timestamps).toBe(true);
    });
});

describe('shipmentSchema', () => {
    it('requires the order and fulfillment order it belongs to, its number, lines and when it left', () => {
        // `trackingCode` is optional: required by the shipping door only when the order's method
        // is `tracked` (a service-level rule, not a schema one — an untracked parcel has none).
        // `deliveredAt` is absent until it arrives — its absence IS "in transit", which is why it
        // carries no default.
        expect(requiredPaths(shipmentSchema)).toEqual([
            'forced',
            'fulfillmentOrderId',
            'lines',
            'number',
            'orderId',
            'shippedAt'
        ]);
    });

    it('allows one shipment per number per order, and many per order', () => {
        const specs = indexOptionSpecs(shipmentSchema);

        expect(specs).toContain('orderId_1_number_1: unique=true');
        expect(specs).not.toContain('orderId_1: unique=true');
    });

    it('points at its order and fulfillment order as real ObjectId references', () => {
        expect(typeOf(shipmentSchema, 'orderId')).toBe('ObjectId');
        expect(refOf(shipmentSchema, 'orderId')).toBe('Order');
        expect(refOf(shipmentSchema, 'fulfillmentOrderId')).toBe('FulfillmentOrder');
    });

    it('restricts status to the contract enum and starts shipped', () => {
        // A shipment exists because something was dispatched, so `shipped` is the honest initial
        // state — there is no "pending" parcel.
        expect(enumOf(shipmentSchema, 'status')).toEqual(Object.values(ShipmentStatus));
        expect(defaultOf(shipmentSchema, 'status')).toBe(ShipmentStatus.shipped);
    });

    it('is not forced unless it says so, and has no delivery timestamp until delivery', () => {
        expect(defaultOf(shipmentSchema, 'forced')).toBe(false);
        expect(defaultOf(shipmentSchema, 'deliveredAt')).toBeUndefined();
    });

    it('keeps timestamps', () => {
        expect(optionsOf(shipmentSchema).timestamps).toBe(true);
    });
});
