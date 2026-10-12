/**
 * @module
 * Delivery's two records, both made database facts by a unique `{ orderId, number }` — the same
 * discipline as the payment's one-per-order:
 *
 * - a **fulfillment order** is a group of an order's lines that should leave together, made by rule
 *   when the order is paid (Shopify's `FulfillmentOrder`);
 * - a **shipment** is what actually left, at one time, with one tracking code (Shopify's
 *   `Fulfillment`). Its two statuses mirror the tail of the order's lifecycle rather than replacing
 *   it, since the tracking code and delivery timestamp are carrier facts the order has no field for.
 *
 * See: docs/modules/delivery.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import {
    FulfillmentCancelReason,
    FulfillmentConsent,
    FulfillmentHoldReason,
    FulfillmentOrderKind,
    FulfillmentOrderStatus,
    ShipmentStatus
} from '@types';
import type { FulfillmentLine } from './domain';

/** One product on a fulfillment order. */
export type FulfillmentOrderLine = FulfillmentLine;

/** One product in a shipment. */
export interface ShipmentLineDocument {
    productId: string;
    title: string;
    quantity: number;
}

/** A group of an order's lines that should leave together. */
export interface FulfillmentOrderDocument extends Document {
    orderId: Types.ObjectId;
    /** 1-based position within the order; unique with `orderId`. */
    number: number;
    kind: FulfillmentOrderKind;
    /** Derived from the lines and the hold on every write — see `statusOfLines`. */
    status: FulfillmentOrderStatus;
    lines: FulfillmentOrderLine[];
    /** Present exactly while `status` is `on_hold`. */
    holdReason?: FulfillmentHoldReason;
    /** Staff's free text about a hold. Reaped like the other free text. */
    holdNote?: string;
    /** The date promised when ordering, frozen from the line snapshot. */
    agreedAt?: Date;
    /** When it is now expected to ship. */
    expectedAt?: Date;
    /**
     * Where a waiting preorder stands with its buyer after a late date; absent until they were
     * asked. See `domain/preorder.ts`.
     */
    consent?: FulfillmentConsent;
    /** When silence turns into a cancel. Present exactly while `consent` is `awaiting`. */
    consentDeadline?: Date;
    /** When the buyer was last told the date moved or passed: what stops a daily repeat. */
    lastNoticeAt?: Date;
    /** How many later dates the buyer was told about: a second slip always asks for a yes. */
    slips: number;
    /** Who cancelled what was left, once something was. */
    cancelReason?: FulfillmentCancelReason;
    /**
     * Counts every write. A shipment or a cancel claims the fulfillment order by matching this, so
     * two of them racing the same remainder cannot both land.
     */
    revision: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/** What left, at one time, with one tracking code. */
export interface ShipmentDocument extends Document {
    orderId: Types.ObjectId;
    fulfillmentOrderId: Types.ObjectId;
    /** 1-based position within the order, in the order shipments were cut; unique with `orderId`. */
    number: number;
    /** The carrier's handle on the parcel. Absent for a method that carries no tracking. */
    trackingCode?: string;
    status: ShipmentStatus;
    lines: ShipmentLineDocument[];
    /** Staff skipped a step to record it, or an override recorded it. */
    forced: boolean;
    shippedAt: Date;
    deliveredAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Queries live in `./repository`, rules in `./services` and `./domain`. */
export type FulfillmentOrderModel = Model<FulfillmentOrderDocument>;

/** Queries live in `./repository`, rules in `./services` and `./domain`. */
export type ShipmentModel = Model<ShipmentDocument>;

/** An embedded fulfillment-order line — nothing addresses one by its own id. */
const fulfillmentLineSchema = new Schema<FulfillmentOrderLine>(
    {
        productId: { type: String, required: true },
        title: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        shippedQuantity: { type: Number, required: true, min: 0, default: 0 },
        cancelledQuantity: { type: Number, required: true, min: 0, default: 0 }
    },
    { _id: false }
);

/** An embedded shipment line. */
const shipmentLineSchema = new Schema<ShipmentLineDocument>(
    {
        productId: { type: String, required: true },
        title: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 }
    },
    { _id: false }
);

/** Mongoose schema for fulfillment orders. */
export const fulfillmentOrderSchema = new Schema<FulfillmentOrderDocument>(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
        number: { type: Number, required: true, min: 1 },
        kind: { type: String, enum: Object.values(FulfillmentOrderKind), required: true },
        status: {
            type: String,
            enum: Object.values(FulfillmentOrderStatus),
            default: FulfillmentOrderStatus.open
        },
        lines: { type: [fulfillmentLineSchema], required: true },
        holdReason: { type: String, enum: Object.values(FulfillmentHoldReason) },
        holdNote: { type: String, maxlength: 1000 },
        agreedAt: { type: Date },
        expectedAt: { type: Date },
        consent: { type: String, enum: Object.values(FulfillmentConsent) },
        consentDeadline: { type: Date },
        lastNoticeAt: { type: Date },
        slips: { type: Number, required: true, min: 0, default: 0 },
        cancelReason: { type: String, enum: Object.values(FulfillmentCancelReason) },
        revision: { type: Number, required: true, default: 0 }
    },
    { timestamps: true }
);

// One fulfillment order per number per order: the idempotency of "made when the order is paid".
fulfillmentOrderSchema.index({ orderId: 1, number: 1 }, { unique: true });

// A moved release date finds the fulfillment orders still waiting for that product.
fulfillmentOrderSchema.index(
    { status: 1, holdReason: 1, 'lines.productId': 1 },
    { name: 'fulfillmentorders_status_holdReason_linesProductId' }
);

// The daily sweep's two reads: a date that passed, and a yes that never came.
fulfillmentOrderSchema.index(
    { status: 1, holdReason: 1, expectedAt: 1 },
    { name: 'fulfillmentorders_status_holdReason_expectedAt' }
);
fulfillmentOrderSchema.index(
    { consent: 1, consentDeadline: 1 },
    { name: 'fulfillmentorders_consent_consentDeadline' }
);

// The preorder board's order (earliest expected first) and its product filter.
fulfillmentOrderSchema.index(
    { expectedAt: 1, _id: 1 },
    { name: 'fulfillmentorders_expectedAt__id' }
);
fulfillmentOrderSchema.index(
    { 'lines.productId': 1 },
    { name: 'fulfillmentorders_linesProductId' }
);

/**
 * Normalizes a serialized fulfillment order: `_id` → `id`, drops `__v`. Owed to the repository
 * factory's lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyFulfillmentOrderTransform = applySerialization(fulfillmentOrderSchema);

/** The compiled fulfillment-order model, registered as `FulfillmentOrder`. */
export const fulfillmentOrderModel = model<FulfillmentOrderDocument, FulfillmentOrderModel>(
    'FulfillmentOrder',
    fulfillmentOrderSchema
);

/** Mongoose schema for shipments. */
export const shipmentSchema = new Schema<ShipmentDocument>(
    {
        orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
        fulfillmentOrderId: {
            type: Schema.Types.ObjectId,
            ref: 'FulfillmentOrder',
            required: true
        },
        number: { type: Number, required: true, min: 1 },
        trackingCode: { type: String },
        status: {
            type: String,
            enum: Object.values(ShipmentStatus),
            default: ShipmentStatus.shipped
        },
        lines: { type: [shipmentLineSchema], required: true },
        forced: { type: Boolean, required: true, default: false },
        shippedAt: { type: Date, required: true },
        deliveredAt: { type: Date }
    },
    { timestamps: true }
);

// A shipment's number is unique within its order: two parallel ships cannot both take the next one.
shipmentSchema.index({ orderId: 1, number: 1 }, { unique: true });

// Backs "the shipments of one fulfillment order".
shipmentSchema.index({ fulfillmentOrderId: 1 });

/**
 * Normalizes a serialized shipment: `_id` → `id`, drops `__v`. Owed to the repository factory's
 * lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyShipmentTransform = applySerialization(shipmentSchema);

/** The compiled shipment model, registered as `Shipment`. */
export const shipmentModel = model<ShipmentDocument, ShipmentModel>('Shipment', shipmentSchema);
