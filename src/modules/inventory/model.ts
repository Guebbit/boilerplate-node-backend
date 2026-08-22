import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { StockMovementReason } from '@types';
import type { StockMovement } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';

/**
 * The two collections this module owns: the ledger and the hold.
 *
 * Neither stores a stock LEVEL — the levels live on the product document, which this module is
 * the only writer of. A catalogue read is the most common query in the shop and must not need a
 * join, while the rules for changing a count are nobody's business but this module's.
 */

/**
 * Every reason the contract declares, in the array shape Mongoose's `enum:` wants. Read off the
 * generated enum rather than retyped — the reasons once had three independent declarations.
 */
export const MOVEMENT_REASONS = Object.values(StockMovementReason);

/**
 * Stock Movement Document interface.
 *
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
 * Indexes.
 *
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
 * Normalizes a serialized movement: `_id` → `id`, drops `__v`. Owed to the base factory for its
 * lean reads (see `normalize` in @infrastructure/persistence/base-repository).
 */
export const applyStockMovementTransform = applySerialization(stockMovementSchema);

export const stockMovementModel = model<StockMovementDocument, StockMovementModel>(
    'StockMovement',
    stockMovementSchema
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
 * Reservation Document interface.
 *
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

export type ReservationModel = Model<ReservationDocument>;

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
         * When the hold stops being honoured. Stamped at reserve time from
         * `NODE_RESERVATION_TTL_MINUTES`, so changing the window leaves existing promises alone.
         *
         * No Mongo TTL index: that would DELETE the document, and the units have to be given back
         * and the story has to survive. Expiry is a sweep — see `runReservationSweep`.
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

export const applyReservationTransform = applySerialization(reservationSchema);

export const reservationModel = model<ReservationDocument, ReservationModel>(
    'Reservation',
    reservationSchema
);
