/**
 * @module
 * Delivery's two records, both made database facts by a unique `{ orderId, number }` — the same
 * discipline as the payment's one-per-order:
 *
 * - a **fulfillment order** is a group of an order's lines that should leave together, made by rule
 *   when the order is paid (Shopify's `FulfillmentOrder`);
 * - a **shipment** is what actually left, at one time, with one tracking code (Shopify's
 *   `Fulfillment`). Its statuses mirror the tail of the order's lifecycle rather than replacing
 *   it, since the tracking code and delivery timestamp are carrier facts the order has no field for;
 *   `lost` is the one a parcel reaches when staff report it will not arrive.
 *
 * See: docs/modules/delivery.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import {
    FulfillmentCancelReason,
    FulfillmentHoldReason,
    FulfillmentOrderKind,
    FulfillmentOrderStatus,
    ShipmentLostReason,
    ShipmentStatus
} from '@types';
import type { OrderAddress } from '@types';
import type { FulfillmentLine, WaitCause } from './domain';

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
    /**
     * When staff put it on hold; set with `holdReason` by a hold and removed by the release. What
     * the staff digest measures "held for too long" from. Never set for `awaiting_stock`.
     */
    heldAt?: Date;
    /** Staff's free text about a hold. Reaped like the other free text. */
    holdNote?: string;
    /**
     * What staff wrote FOR the buyer about a hold: a sentence the buyer reads and is mailed. Kept
     * with the order like any message sent to a customer, so it is not scrubbed with `holdNote`;
     * a release drops it with the hold.
     */
    holdMessage?: string;
    /** Why it waits for stock; present exactly when it does. Absent reads `preorder`. */
    cause?: WaitCause;
    /**
     * The promise was the 30-day default, not a date the catalogue named: a later change to the
     * catalogue's date leaves this order alone.
     */
    defaulted?: boolean;
    /** The date promised when ordering, frozen from the line snapshot. */
    agreedAt?: Date;
    /**
     * The date the buyer holds now: starts as `agreedAt`, a later date from a notice replaces it,
     * a cleared date ("no date yet") removes it. What the next slip's consent reminder is
     * measured against (`tasks`, 16 CFR 435.2); the buyer is never asked.
     */
    promisedAt?: Date;
    /** When it is now expected to ship. */
    expectedAt?: Date;
    /** When the buyer was last told the date moved or would be missed. */
    lastNoticeAt?: Date;
    /** The `expectedAt` the sweep's due notice was sent for: what stops a daily repeat. */
    dueNoticeFor?: Date;
    /** Who cancelled what was left, once something was. */
    cancelReason?: FulfillmentCancelReason;
    /**
     * The lost shipment whose owed units this fulfillment order waits for: present on the order made
     * by a loss the shelf could not cover, and copied to the order a short stock delivery splits
     * off it. What lets the parcel turning up find, and close, every part that is still owed.
     */
    sourceShipmentId?: Types.ObjectId;
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
    /** The kind of fulfillment order it left from, frozen at the cut: a digital one never had a carrier. */
    kind: FulfillmentOrderKind;
    /** The carrier's handle on the parcel. Absent for a method that carries no tracking, or not known yet. */
    trackingCode?: string;
    status: ShipmentStatus;
    lines: ShipmentLineDocument[];
    /**
     * Where this parcel went: a copy of the order's shipping address at the cut, stored encrypted
     * under the shipment's `_id` (`./pii`). Absent for a method with no address (a pickup) and for a
     * digital fulfilment. Wiped when the order's own address is (`order.redacted`).
     */
    destination?: OrderAddress;
    /** Staff skipped a step to record it, or an override recorded it. */
    forced: boolean;
    shippedAt: Date;
    deliveredAt?: Date;
    /** When staff reported it lost or damaged; kept when it turns up and is then delivered. */
    lostAt?: Date;
    lostReason?: ShipmentLostReason;
    /** Staff's free text about the loss. Reaped like `holdNote`. */
    lostNote?: string;
    /** What staff wrote FOR the buyer about the loss. Kept with the order, never reaped. */
    lostMessage?: string;
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

/** The embedded destination: the order's address fields, each an encrypted string. */
const destinationSchema = new Schema<OrderAddress>(
    {
        fullName: { type: String },
        street: { type: String },
        city: { type: String },
        zip: { type: String },
        country: { type: String },
        phone: { type: String }
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
        heldAt: { type: Date },
        holdNote: { type: String, maxlength: 1000 },
        holdMessage: { type: String, maxlength: 500 },
        cause: { type: String, enum: ['preorder', 'backorder'] },
        defaulted: { type: Boolean },
        agreedAt: { type: Date },
        promisedAt: { type: Date },
        expectedAt: { type: Date },
        lastNoticeAt: { type: Date },
        dueNoticeFor: { type: Date },
        cancelReason: { type: String, enum: Object.values(FulfillmentCancelReason) },
        sourceShipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
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

// The daily sweep's read: a date a day away or gone.
fulfillmentOrderSchema.index(
    { status: 1, holdReason: 1, expectedAt: 1 },
    { name: 'fulfillmentorders_status_holdReason_expectedAt' }
);

// Finds every fulfillment order a lost parcel left owing, when the parcel turns up.
fulfillmentOrderSchema.index(
    { sourceShipmentId: 1 },
    { name: 'fulfillmentorders_sourceShipmentId', sparse: true }
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
        kind: { type: String, enum: Object.values(FulfillmentOrderKind), required: true },
        trackingCode: { type: String },
        status: {
            type: String,
            enum: Object.values(ShipmentStatus),
            default: ShipmentStatus.shipped
        },
        lines: { type: [shipmentLineSchema], required: true },
        destination: { type: destinationSchema },
        forced: { type: Boolean, required: true, default: false },
        shippedAt: { type: Date, required: true },
        deliveredAt: { type: Date },
        lostAt: { type: Date },
        lostReason: { type: String, enum: Object.values(ShipmentLostReason) },
        lostNote: { type: String, maxlength: 1000 },
        lostMessage: { type: String, maxlength: 500 }
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
