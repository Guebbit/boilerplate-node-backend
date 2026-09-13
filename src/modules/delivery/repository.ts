/**
 * @module
 * Shipment repository — standard CRUD via the repository factory, plus the lookups the courier
 * actually makes. The return type is written out because Mongoose's generics are too large for
 * TypeScript to serialize an inferred one at an export boundary (TS7056), the same reason
 * `Repository` exists. See: docs/modules/delivery.md
 */

import { shipmentModel, applyShipmentTransform } from './model';
import type { ShipmentStatus } from '@types';
import type { ShipmentDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';

/** The shared repository factory's CRUD surface plus the courier's own lookups. */
export const shipmentRepository: Repository<ShipmentDocument> & {
    findByOrderId: (orderId: string) => Promise<ShipmentDocument | null>;
    findByOrderIds: (orderIds: string[]) => Promise<ShipmentDocument[]>;
    upsertForOrder: (orderId: string, trackingCode: string) => Promise<ShipmentDocument>;
    findAllShipped: () => Promise<ShipmentDocument[]>;
    updateStatusIfIn: (
        orderId: string,
        from: readonly ShipmentStatus[],
        to: ShipmentStatus,
        extra?: Partial<ShipmentDocument>
    ) => Promise<ShipmentDocument | null>;
} = {
    ...createRepository<ShipmentDocument>(shipmentModel, {
        transform: applyShipmentTransform
    }),

    /** The shipment behind an order, or `null` while nothing has left the warehouse. */
    findByOrderId: (orderId: string) =>
        shipmentModel.findOne({ orderId: toObjectId(orderId) }).exec(),

    /**
     * Every shipment behind a set of orders, in one query — for the account data export, joining
     * shipments onto the caller's own orders. A loop of {@link findByOrderId} would work too, but
     * one query per order for what is meant to be a single export request is the wrong shape.
     */
    findByOrderIds: (orderIds: string[]) =>
        shipmentModel.find({ orderId: { $in: orderIds.map((id) => toObjectId(id)) } }).exec(),

    /**
     * Create the shipment for an order, idempotently: `unique` on `orderId` plus the upsert
     * means an order re-entering `shipped` (admin fixing a status mistake) finds its existing
     * parcel rather than minting a second tracking code.
     */
    upsertForOrder: (orderId: string, trackingCode: string) =>
        shipmentModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId) },
                { $setOnInsert: { trackingCode, status: 'shipped' } },
                { upsert: true, returnDocument: 'after' }
            )
            .exec(),

    /** Every parcel still on a truck — the fake courier's work list. */
    findAllShipped: () => shipmentModel.find({ status: 'shipped' }).exec(),

    /**
     * Move a parcel between statuses, but only from one of the expected ones — atomically, the
     * same primitive `orderRepository`/`paymentRepository` expose. The condition rides in the
     * FILTER, not a preceding read: two courier ticks racing (a double click, a demo racing a
     * manual advance) would otherwise both load the same `shipped` parcel and both stamp
     * `deliveredAt`, the second write winning silently and the timestamp lying about when the
     * parcel arrived. mongod evaluates the filter atomically, so exactly one tick matches; the
     * loser gets `null`. Keyed on `orderId`, like `paymentRepository`'s, since `unique` on it
     * makes it a key.
     */
    updateStatusIfIn: (orderId, from, to, extra = {}) =>
        shipmentModel
            .findOneAndUpdate(
                { orderId: toObjectId(orderId), status: { $in: [...from] } },
                { $set: { status: to, ...extra } },
                { returnDocument: 'after' }
            )
            .exec()
};
