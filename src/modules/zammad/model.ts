/**
 * @module
 * The four collections this module owns, all small and all about delivery and erasure, never about tickets:
 * `zammadcontacts` (a message waiting to be handed over), `zammadcustomers` (which Zammad customer
 * a signed-in account is), `zammadprofilesyncs` (an account whose profile Zammad must be told
 * about) and `zammaderasejobs` (a person Zammad must forget, and the proof it did).
 *
 * @see docs/modules/zammad.md#the-hand-over
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { DAY_SECONDS } from '@domain-primitives/time';
import { applySerialization } from '@infrastructure/persistence/serialize';

/** How long a record of a fallback outlives it, for the alert that counts them. */
const FALLBACK_TOMBSTONE_DAYS = 7;

/**
 * A contact message on its way to Zammad: the visitor's words, kept until the ticket exists.
 * After the last retry it becomes a tombstone (`state: 'fell_back'`) holding no words at all:
 * the to-do took the message over, and the tombstone only lets the alert count the fallback.
 */
export interface ZammadContactDocument extends Document {
    state: 'pending' | 'fell_back';
    /**
     * Whether the email check refused the address: the ticket is filed already closed and tagged
     * `suspected-spam`, with notifications suppressed. A honeypot catch never reaches this module.
     */
    suspectedSpam?: boolean;
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    category?: string;
    orderNumber?: string;
    /** The signed-in sender's account, when there was one. */
    subjectId?: Types.ObjectId;
    /** Failed attempts so far. */
    attempts: number;
    /** Not before this instant. */
    nextAttemptAt: Date;
    /**
     * Whether any attempt ended with the outcome unknown (timeout, 5xx, 429): the ticket may exist,
     * so the next attempt looks the `request_ref` up before it creates anything. Sticky.
     */
    unclear: boolean;
    /** The claim of the attempt in flight. */
    leaseToken?: string;
    /** When that claim lapses. */
    leaseExpiresAt?: Date;
    /** When the message fell back to a to-do. */
    fellBackAt?: Date;
    createdAt?: Date;
}

/** Contact message schema. */
export const zammadContactSchema = new Schema<ZammadContactDocument>(
    {
        state: { type: String, enum: ['pending', 'fell_back'], default: 'pending', required: true },
        suspectedSpam: { type: Boolean },
        name: { type: String },
        email: { type: String },
        subject: { type: String },
        message: { type: String },
        category: { type: String },
        orderNumber: { type: String },
        subjectId: { type: Schema.Types.ObjectId, ref: 'User' },
        attempts: { type: Number, default: 0, required: true },
        nextAttemptAt: { type: Date, required: true },
        unclear: { type: Boolean, default: false, required: true },
        leaseToken: { type: String },
        leaseExpiresAt: { type: Date },
        fellBackAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// The sweep's read: the due pending rows, oldest first.
zammadContactSchema.index({ state: 1, nextAttemptAt: 1 });
// The erasure and the export find a person's rows by account or by address.
zammadContactSchema.index({ subjectId: 1 }, { sparse: true });
zammadContactSchema.index({ email: 1 }, { sparse: true });
// A tombstone expires by itself; a pending row has no `fellBackAt` and never does.
zammadContactSchema.index(
    { fellBackAt: 1 },
    { expireAfterSeconds: FALLBACK_TOMBSTONE_DAYS * DAY_SECONDS, name: 'zammad_fallback_ttl' }
);

/**
 * The claim is bookkeeping, not a fact about the message: it never serializes. Nothing returns
 * these documents over HTTP, but the credential sweep asks every model, and a lease token is the
 * kind of field that must not leak if one ever were.
 */
applySerialization(zammadContactSchema, { omit: ['leaseToken', 'leaseExpiresAt'] });

/** Contact message model entrypoint. Collection `zammadcontacts`. */
export const zammadContactModel = model<ZammadContactDocument, Model<ZammadContactDocument>>(
    'ZammadContact',
    zammadContactSchema
);

/** Which Zammad customer a signed-in account is: written only under the signed-in-sender rule. */
export interface ZammadCustomerDocument extends Document {
    userId: Types.ObjectId;
    zammadUserId: number;
    createdAt?: Date;
}

/** Customer mapping schema. */
export const zammadCustomerSchema = new Schema<ZammadCustomerDocument>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        zammadUserId: { type: Number, required: true }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// One customer per account; the upsert on this key is what makes a second ticket the same write.
zammadCustomerSchema.index({ userId: 1 }, { unique: true });

/** Customer mapping model entrypoint. Collection `zammadcustomers`. */
export const zammadCustomerModel = model<ZammadCustomerDocument, Model<ZammadCustomerDocument>>(
    'ZammadCustomer',
    zammadCustomerSchema
);

/** One account whose profile Zammad is owed: the row names the account, the sweep reads current data. */
export interface ZammadProfileSyncDocument extends Document {
    userId: Types.ObjectId;
    /** The newest change this row stands for. */
    requestedAt: Date;
    attempts: number;
    nextAttemptAt: Date;
    leaseToken?: string;
    leaseExpiresAt?: Date;
}

/** Profile sync rows: the unique `userId` below is the upsert key. */
export const zammadProfileSyncSchema = new Schema<ZammadProfileSyncDocument>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        requestedAt: { type: Date, required: true },
        attempts: { type: Number, default: 0, required: true },
        nextAttemptAt: { type: Date, required: true },
        leaseToken: { type: String },
        leaseExpiresAt: { type: Date }
    },
    { timestamps: false }
);

// One row per account: a second change while one waits only moves `requestedAt`.
zammadProfileSyncSchema.index({ userId: 1 }, { unique: true });
zammadProfileSyncSchema.index({ nextAttemptAt: 1 });

// Same as the contact rows: the claim never serializes.
applySerialization(zammadProfileSyncSchema, { omit: ['leaseToken', 'leaseExpiresAt'] });

/** Profile sync model entrypoint. Collection `zammadprofilesyncs`. */
export const zammadProfileSyncModel = model<
    ZammadProfileSyncDocument,
    Model<ZammadProfileSyncDocument>
>('ZammadProfileSync', zammadProfileSyncSchema);

/** One Zammad customer an erase job must see deleted, and how far its deletion task got. */
export interface ZammadEraseTarget {
    zammadUserId: number;
    /** The id of the data-privacy task filed for this customer, once there is one. */
    taskId?: number;
    /** When the task was filed: the clock the "stuck" alert reads. */
    filedAt?: Date;
    /** Whether the customer is gone from Zammad (task `completed`, or the customer was already absent). */
    done: boolean;
}

/**
 * A person Zammad must forget. Written inside the erasure's transaction, so it exists exactly when
 * the account is gone; drained by `sweep:zammad-erasures`. After `completed` the row drops the
 * address and stays, without anything a person could be found by, until the erasure ledger's
 * window ends: it is what `--since` replays after Zammad alone is restored.
 */
export interface ZammadEraseJobDocument extends Document {
    /** The erased account; absent for the customer an erasure race left behind. */
    userId?: Types.ObjectId;
    /**
     * The verified address the account held, so a customer who wrote before the account existed
     * is found too. Absent for an unverified account, and dropped once `completed`.
     */
    email?: string;
    /** Whether the address was looked up in Zammad already. */
    emailResolved: boolean;
    /** Every Zammad customer to delete: the account's mapping, then what the address lookup found. */
    targets: ZammadEraseTarget[];
    /**
     * `pending` is work to do or a task to follow; `completed` is finished; `failed` is a task
     * Zammad itself reported failed: a technician looks, the sweep does not retry it.
     */
    state: 'pending' | 'completed' | 'failed';
    /** Failed polls and lookups so far, for the retry ladder. */
    attempts: number;
    /** Not before this instant. */
    nextAttemptAt: Date;
    leaseToken?: string;
    leaseExpiresAt?: Date;
    /** When the last customer was confirmed gone. */
    completedAt?: Date;
    /** Mongo deletes the row at this instant: `completedAt` plus the erasure ledger's window. */
    expireAt?: Date;
    createdAt?: Date;
}

/** Erase job schema: the unique-free queue of persons Zammad must forget. */
export const zammadEraseJobSchema = new Schema<ZammadEraseJobDocument>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        email: { type: String },
        emailResolved: { type: Boolean, default: false, required: true },
        targets: {
            type: [
                new Schema(
                    {
                        zammadUserId: { type: Number, required: true },
                        taskId: { type: Number },
                        filedAt: { type: Date },
                        done: { type: Boolean, default: false, required: true }
                    },
                    { _id: false }
                )
            ],
            default: []
        },
        state: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'pending',
            required: true
        },
        attempts: { type: Number, default: 0, required: true },
        nextAttemptAt: { type: Date, required: true },
        leaseToken: { type: String },
        leaseExpiresAt: { type: Date },
        completedAt: { type: Date },
        expireAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// The sweep's read: pending rows that are due.
zammadEraseJobSchema.index({ state: 1, nextAttemptAt: 1 });
// The replay's read: rows completed since the dump.
zammadEraseJobSchema.index({ completedAt: 1 }, { sparse: true });
// A completed row expires with the erasure ledger; a pending or failed one has no `expireAt` and never does.
zammadEraseJobSchema.index(
    { expireAt: 1 },
    { expireAfterSeconds: 0, name: 'zammad_erase_job_ttl' }
);

// The claim never serializes, as on the other collections.
applySerialization(zammadEraseJobSchema, { omit: ['leaseToken', 'leaseExpiresAt'] });

/** Erase job model entrypoint. Collection `zammaderasejobs`. */
export const zammadEraseJobModel = model<ZammadEraseJobDocument, Model<ZammadEraseJobDocument>>(
    'ZammadEraseJob',
    zammadEraseJobSchema
);
