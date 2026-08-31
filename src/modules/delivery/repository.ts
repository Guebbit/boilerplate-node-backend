/**
 * @module
 * Shipment repository — standard CRUD via the repository factory, plus the lookups the courier
 * actually makes.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `Repository` exists.
 *
 * See: docs/modules/delivery.md
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
     * Move a parcel between statuses, but only from one of the expected ones — atomically. The
     * same primitive `orderRepository` and `paymentRepository` expose, over this collection.
     *
     * The condition rides IN THE FILTER rather than in a preceding read, which is what the
     * courier's tick needs and a read-modify-write cannot give it. That tick is a job function
     * behind an admin endpoint (see the service's docblock): nothing stops two of them running at
     * once — an operator clicking twice, a demo script racing a manual advance — and both would
     * load the SAME `shipped` parcel from `findAllShipped`, both stamp `deliveredAt = now`, and
     * both save. The second write wins silently, so the delivery timestamp records whichever tick
     * happened to finish last rather than when the parcel actually arrived. mongod evaluates the
     * filter while holding the document, so exactly one tick matches; the loser gets `null` and
     * has nothing left to say.
     *
     * Keyed on `orderId` rather than the shipment's own id, like `paymentRepository`'s: `unique`
     * on `orderId` makes it a key, and every caller here is holding an order.
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
