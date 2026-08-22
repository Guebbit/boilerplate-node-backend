import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { ShipmentStatus } from '@types';

/**
 * Shipment Model
 *
 * One shipment per order, made a database fact by `unique` on `orderId` — the same discipline
 * as the payment's. A shipment exists because an order reached `shipped`; its two statuses
 * mirror the tail of the ORDER's lifecycle rather than replacing it, because the tracking code
 * and the delivery timestamp are courier facts the order has no field for.
 */

/**
 * Shipment Document interface.
 */
export interface ShipmentDocument extends Document {
    orderId: Types.ObjectId;
    /** The courier's handle on the parcel — fake here, but shaped like the real thing. */
    trackingCode: string;
    status: ShipmentStatus;
    deliveredAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Shipment Document model type. Queries live in `./repository`, rules in `./service`. */
export type ShipmentModel = Model<ShipmentDocument>;

export const shipmentSchema = new Schema<ShipmentDocument>(
    {
        orderId: {
            type: Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            unique: true
        },
        trackingCode: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: Object.values(ShipmentStatus),
            default: ShipmentStatus.shipped
        },
        deliveredAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

/**
 * Normalizes a serialized shipment: `_id` → `id`, drops `__v`. Owed to the base factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyShipmentTransform = applySerialization(shipmentSchema);

/**
 * Model
 */
export const shipmentModel = model<ShipmentDocument, ShipmentModel>('Shipment', shipmentSchema);
