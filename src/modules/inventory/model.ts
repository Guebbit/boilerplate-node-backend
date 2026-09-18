/**
 * @module
 * The three collections this module owns: the stock level, the ledger, and the hold.
 *
 * The stock level is the source of truth for `onHand`/`reserved` — `products` keeps a synced copy
 * on its own document purely so a catalogue read needs no join, but never writes it and this
 * module never reads that copy back. See `docs/modules/inventory.md#why-products-still-carries-a-copy`.
 *
 * See: docs/modules/inventory.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { StockMovementReason } from '@types';
import type { StockMovement } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * Every reason the contract declares, in the array shape Mongoose's `enum:` wants. Read off the
 * generated enum rather than retyped — the reasons once had three independent declarations.
 */
export const MOVEMENT_REASONS = Object.values(StockMovementReason);

/**
 * The field list comes from the contract's `StockMovement`, the same way `ProductDocument` takes
 * its own from `Product`. Only what storage genuinely disagrees with the wire about is restated:
 * `productId` is a real `ObjectId` here, and the timestamps are `Date`s rather than ISO strings.
 */
export interface StockMovementDocument
    extends Omit<StockMovement, 'id' | 'productId' | 'createdAt' | 'updatedAt'>, Document {
    productId: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Stock Movement model type. Queries live in `./repository`, rules in `./service`. */
export type StockMovementModel = Model<StockMovementDocument>;

/** Mongoose Schema for the ledger. Append-only — see `./repository` for why. */
export const stockMovementSchema = new Schema<StockMovementDocument>(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        reason: {
            type: String,
            enum: MOVEMENT_REASONS,
            required: true
        },
        /*
         * Both deltas on every row, either possibly zero. Storing the pair rather than one signed
         * number is what makes the ledger replayable — summing each column over a product's rows
         * reproduces the counter it describes. `default: 0` because most transitions move only
         * one column.
         */
        onHandDelta: {
            type: Number,
            default: 0
        },
        reservedDelta: {
            type: Number,
            default: 0
        },
        /** The order this movement belongs to, when one does. Absent on receipts and stocktakes. */
        reference: {
            type: String
        },
        /** The operator's own words, on the two transitions a human originates. */
        note: {
            type: String
        }
    },
    {
        timestamps: true
    }
);

/*
 * The names are given rather than derived: Mongo identifies an index by its name as much as by
 * its key, so asking for a key it already holds under a different name fails at startup instead
 * of doing nothing.
 */
/* The one question the ledger answers on its own: "what happened to THIS product, latest first". */
stockMovementSchema.index(
    { productId: 1, createdAt: -1 },
    { name: 'stockmovements_productId_createdAt' }
);
/* The whole shop's ledger, newest first — the unfiltered admin view. */
stockMovementSchema.index({ createdAt: -1 }, { name: 'stockmovements_createdAt' });

/**
 * Normalizes a serialized movement: `_id` → `id`, drops `__v`. Owed to the repository factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/create-repository).
 */
export const applyStockMovementTransform = applySerialization(stockMovementSchema);

/** Mongoose model for the ledger. */
export const stockMovementModel = model<StockMovementDocument, StockMovementModel>(
    'StockMovement',
    stockMovementSchema
);

/* ────────────────────────────────────────────────────────────────────────────────────────── */

/** One product's stock counters — the source of truth `applyTransition` writes, one row each. */
export interface StockLevelDocument extends Document {
    productId: Types.ObjectId;
    onHand: number;
    reserved: number;
    /**
     * `onHand - reserved`, clamped at zero — stored and kept in step by `applyTransition` rather
     * than derived at read time, so the stock board's `maxAvailable` narrowing runs against an
     * indexed column instead of scanning to derive it first. `products/repository.ts`'s old
     * `availabilityPage` named exactly this fix as the one it deliberately wasn't doing; owning
     * the collection is what makes it free. The board's own tie-break sort still runs over the
     * narrowed set in memory — see `./repository`'s `stockBoard`.
     */
    available: number;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Stock level model type. Queries live in `./repository`, rules in `./service`. */
export type StockLevelModel = Model<StockLevelDocument>;

/**
 * Mongoose Schema for a product's stock level. One document per product — `productId`'s unique
 * index is what makes the opening-stock write (`PRODUCT_CREATED`'s listener) safe to run twice: a
 * retried event finds the row already there and its own guarded write simply matches nothing.
 */
export const stockLevelSchema = new Schema<StockLevelDocument>(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
            unique: true
        },
        onHand: {
            type: Number,
            default: 0,
            min: 0
        },
        reserved: {
            type: Number,
            default: 0,
            min: 0
        },
        available: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    {
        timestamps: true
    }
);

/* The stock board's own query: scarcest first. */
stockLevelSchema.index({ available: 1, _id: 1 }, { name: 'stocklevels_available__id' });

/** `_id` → `id`, dates to ISO strings. */
export const applyStockLevelTransform = applySerialization(stockLevelSchema);

/** Mongoose model for the stock level collection. */
export const stockLevelModel = model<StockLevelDocument, StockLevelModel>(
    'StockLevel',
    stockLevelSchema
);

/* ────────────────────────────────────────────────────────────────────────────────────────── */

/** What one hold claimed, per product. */
export interface ReservationItem {
    productId: Types.ObjectId;
    quantity: number;
}

/** The three states a hold can be in. Terminal states are terminal — nothing leaves them. */
export type ReservationStatus = 'held' | 'committed' | 'released';

/**
 * Deliberately not derived from a contract type, because there is none: a reservation is never
 * serialized to a client. The customer already has a better view of it — their order — and
 * publishing this would invite a frontend to read stock state from two places.
 */
export interface ReservationDocument extends Document {
    orderId: Types.ObjectId;
    items: ReservationItem[];
    status: ReservationStatus;
    expiresAt: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Reservation model type. Queries live in `./repository`, rules in `./service`. */
export type ReservationModel = Model<ReservationDocument>;

/** Sub-schema for one claimed line, embedded on the hold rather than referenced. */
const reservationItemSchema = new Schema<ReservationItem>(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        }
    },
    { _id: false }
);

/** Mongoose Schema for a hold. One document per order — see `orderId`'s unique index below. */
export const reservationSchema = new Schema<ReservationDocument>(
    {
        /*
         * Unique, and load-bearing rather than hygienic: it is what makes reserving exactly once.
         * A retried checkout needs no read-then-write to detect — the second insert simply fails
         * and no counter moves.
         */
        orderId: {
            type: Schema.Types.ObjectId,
            required: true,
            unique: true
        },
        /*
         * The hold's own copy of what it claimed, rather than a lookup through the order. If
         * releasing had to read the order's items this module would depend on `orders`, which
         * already depends on it — a cycle. It is also more correct: what must be given back is
         * what was taken, not what the order says today.
         */
        items: {
            type: [reservationItemSchema],
            required: true
        },
        /*
         * The exactly-once gate. Every lifecycle operation is a conditional move off `held`, so a
         * second cancel, a duplicate webhook or a sweep racing a payment loses the match and does
         * nothing — the same primitive `orderRepository.updateStatusIfIn` is built on.
         */
        status: {
            type: String,
            enum: ['held', 'committed', 'released'] satisfies ReservationStatus[],
            default: 'held',
            required: true
        },
        /*
         * No Mongo TTL index: that would delete the document outright, but the units still need
         * giving back and the story needs to survive. Expiry is a sweep — see `runReservationSweep`.
         */
        expiresAt: {
            type: Date,
            required: true
        }
    },
    {
        timestamps: true
    }
);

/* The sweep's only query: holds still held, oldest deadline first. */
reservationSchema.index({ status: 1, expiresAt: 1 }, { name: 'reservations_status_expiresAt' });

/** `_id` → `id`, dates to ISO strings — the shape every reservation read answers in. */
export const applyReservationTransform = applySerialization(reservationSchema);

/** Mongoose model for reservation CRUD operations. */
export const reservationModel = model<ReservationDocument, ReservationModel>(
    'Reservation',
    reservationSchema
);
