import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Shipment Model
 *
 * One shipment per order, made a database fact by `unique` on `orderId` — the same discipline
 * as the payment's. A shipment exists because an order reached `shipped`; its two statuses
 * mirror the tail of the ORDER's lifecycle rather than replacing it, because the tracking code
 * and the delivery timestamp are courier facts the order has no field for.
 */

export const SHIPMENT_STATUSES = ['shipped', 'delivered'] as const;

export type TShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * Shipment Document interface.
 */
export interface IShipmentDocument extends Document {
    orderId: Types.ObjectId;
    /** The courier's handle on the parcel — fake here, but shaped like the real thing. */
    trackingCode: string;
    status: TShipmentStatus;
    deliveredAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Shipment Document model type. Queries live in `./repository`, rules in `./service`. */
export type IShipmentModel = Model<IShipmentDocument>;

export const shipmentSchema = new Schema<IShipmentDocument>(
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
            enum: SHIPMENT_STATUSES,
            default: 'shipped'
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
export const shipmentModel = model<IShipmentDocument, IShipmentModel>('Shipment', shipmentSchema);
