/**
 * @module
 * The three collections this module owns, all small and all about delivery, never about tickets:
 * `zammadcontacts` (a message waiting to be handed over), `zammadcustomers` (which Zammad customer
 * a signed-in account is) and `zammadprofilesyncs` (an account whose profile Zammad must be told
 * about).
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
