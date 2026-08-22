import { shipmentModel, applyShipmentTransform } from './model';
import type { ShipmentDocument } from './model';
import {
    createBaseRepository,
    toObjectId,
    type BaseRepository
} from '@infrastructure/persistence/base-repository';

/**
 * Shipment Repository
 * Standard CRUD via the base factory, plus the lookups the courier actually makes.
 *
 * The type is written out because Mongoose's generics are too large for TypeScript to serialize
 * an inferred one at an export boundary (TS7056) — the same reason `BaseRepository` exists.
 */
export const shipmentRepository: BaseRepository<ShipmentDocument> & {
    findByOrderId: (orderId: string) => Promise<ShipmentDocument | null>;
    upsertForOrder: (orderId: string, trackingCode: string) => Promise<ShipmentDocument>;
    findAllShipped: () => Promise<ShipmentDocument[]>;
} = {
    ...createBaseRepository<ShipmentDocument>(shipmentModel, {
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
    findAllShipped: () => shipmentModel.find({ status: 'shipped' }).exec()
};
