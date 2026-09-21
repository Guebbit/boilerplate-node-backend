/**
 * @module
 * The two collections this module owns: `webhooksubscriptions` (a tenant's standing subscription
 * to a slice of the public event catalogue) and `webhookdeliveries` (one row per event ×
 * subscription, tracking attempts through to success, exhaustion, or a subscriber never told
 * about it because the subscription was disabled first).
 *
 * See: docs/reference/data.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * One secret in a subscription's ring — see `./secrets` for encryption at rest and rotation.
 * `ciphertext` is the ONLY form ever persisted; the plaintext exists for the seconds between
 * minting it and returning it in an HTTP response, and again in memory for as long as a delivery
 * attempt needs it to sign.
 */
export interface WebhookSecretRingEntry {
    id: string;
    ciphertext: string;
    createdAt: Date;
}

/** A tenant's standing subscription to a slice of the public event catalogue. */
export interface WebhookSubscriptionDocument extends Document {
    tenant: string;
    url: string;
    description?: string;
    eventTypes: string[];
    enabled: boolean;
    consecutiveFailures: number;
    disabledAt?: Date;
    /**
     * When the CURRENT failure streak began — the first failure after a success (or after
     * creation), cleared on the next success. `domain#shouldAutoDisable`'s time floor reads this;
     * `repository.ts#recordOutcome` is the only writer. Absent whenever the streak is empty:
     * `consecutiveFailures` is 0.
     */
    failingSince?: Date;
    /**
     * The id of whoever created this subscription — a pointer, not a copy of their email: GDPR
     * data minimisation (Art. 5(1)(c)/(d)), and the same shape Stripe uses for a failing webhook
     * endpoint's account notice. `services/attempt.ts`'s auto-disable notice resolves the current
     * email from this id at send time. Absent on a subscription that predates this field, or one
     * created by a stranger; either way, no notice is sent, silently — the audit entry auto-disable
     * already writes is not lost.
     */
    ownerUserId?: string;
    secrets: WebhookSecretRingEntry[];
    createdAt: Date;
    updatedAt: Date;
}

/** Mongoose model type for {@link WebhookSubscriptionDocument}. */
export type WebhookSubscriptionModel = Model<WebhookSubscriptionDocument>;

/** Subscription collection schema. */
export const webhookSubscriptionSchema = new Schema<
    WebhookSubscriptionDocument,
    WebhookSubscriptionModel
>(
    {
        // The organisation this row belongs to — not `locales/model.ts`'s own `tenant` field,
        // a translation keyspace with the same name and nothing else in common. See
        // docs/theory/tenancy.md's glossary.
        tenant: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        url: {
            type: String,
            required: true
        },
        description: {
            type: String
        },
        ownerUserId: {
            type: String
        },
        eventTypes: {
            type: [String],
            required: true,
            validate: {
                validator: (value: string[]) => value.length > 0,
                message: 'A subscription must name at least one event type.'
            }
        },
        enabled: {
            type: Boolean,
            required: true,
            default: true
        },
        consecutiveFailures: {
            type: Number,
            required: true,
            default: 0
        },
        failingSince: {
            type: Date
        },
        disabledAt: {
            type: Date
        },
        // `_id: false` PLUS an explicit `id`: `./secrets.ts`'s `mintRingSecret` mints the id itself
        // (`randomUUID()`) before the subscription is ever saved, so the CREATE response can name
        // the ring entry it just made — an auto-assigned Mongoose `_id` is not knowable that early.
        // Declared as a real schema field (not left to `_id`) so it round-trips through `.lean()`
        // reads too, where no virtual is ever applied.
        secrets: {
            type: [
                new Schema<WebhookSecretRingEntry>(
                    {
                        id: { type: String, required: true },
                        ciphertext: { type: String, required: true }
                    },
                    { _id: false, timestamps: { createdAt: true, updatedAt: false } }
                )
            ],
            default: []
        }
    },
    { timestamps: true }
);

// "This tenant's subscriptions", and "which subscriptions want event X" — the two questions
// `publish` and the admin list both ask.
webhookSubscriptionSchema.index({ tenant: 1, createdAt: -1 });
webhookSubscriptionSchema.index({ enabled: 1, eventTypes: 1 });

/**
 * Wire shape: `_id` → `id`, `secrets` collapses to `secretIds` (the ring's ids, never its
 * ciphertext or plaintext) — a subscription response must never be the thing an attacker reads to
 * forge a delivery.
 *
 * `secrets` is read and deleted INSIDE `after`, rather than named in `omit`: `omit` runs before
 * `after` (see `applySerialization`), so a field named there is already gone by the time `after`
 * could derive anything from it.
 */
export const applyWebhookSubscriptionTransform = applySerialization(webhookSubscriptionSchema, {
    omit: ['tenant', 'ownerUserId', 'failingSince'],
    after: (serialized) => {
        const secrets = serialized.secrets as WebhookSecretRingEntry[] | undefined;
        serialized.secretIds = (secrets ?? []).map((entry) => entry.id);
        delete serialized.secrets;
    }
});

/** Subscription model entrypoint. Collection name `webhooksubscriptions`. */
export const webhookSubscriptionModel = model<
    WebhookSubscriptionDocument,
    WebhookSubscriptionModel
>('WebhookSubscription', webhookSubscriptionSchema);

/**
 * The states one delivery row moves through. See `./domain/backoff` for the retry ladder.
 *
 * `in-flight` is a LEASED claim — `repository.ts`'s `claimPending`/`claimForReplay` make it, with
 * `leaseToken`/`leaseExpiresAt` stamped in the same write, before a worker or a replay actually
 * calls the endpoint. It exists so the sweep (which only publishes, never claims) and a worker
 * racing the same due row cannot both deliver it — never a state a caller sets directly. A failed
 * attempt with retries left goes back to `pending` with a later `nextAttemptAt`; only `exhausted`
 * is terminal. No `failed` state: Stripe, GitHub and Svix all keep per-attempt history instead, so
 * even under that design a failure belongs on an attempt, not on the delivery row — a future
 * per-attempt log would carry its own outcome enum rather than reviving this one.
 */
export type WebhookDeliveryStatus = 'pending' | 'in-flight' | 'succeeded' | 'exhausted';

/** One event's delivery to one subscription, updated in place across retries. */
export interface WebhookDeliveryDocument extends Document {
    tenant: string;
    subscriptionId: Types.ObjectId;
    eventId: string;
    eventType: string;
    payload: Record<string, unknown>;
    attempt: number;
    status: WebhookDeliveryStatus;
    responseCode?: number;
    durationMs?: number;
    error?: string;
    nextAttemptAt?: Date;
    /**
     * A visibility-timeout lease, the way SQS does it — set together, `undefined` on a row that
     * has never been claimed. While `status` is `in-flight` and `leaseExpiresAt` is still in the
     * future, this delivery is somebody's exclusive claim: `applyOutcome` writes only while its
     * caller's token still matches, and neither `claimPending` nor `claimForReplay` will hand the
     * row to anyone else. Once the lease expires, both treat the row as claimable again — the
     * crash-recovery path for a worker that took the row and never finished.
     */
    leaseToken?: string;
    /** See {@link leaseToken}. */
    leaseExpiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

/** Mongoose model type for {@link WebhookDeliveryDocument}. */
export type WebhookDeliveryModel = Model<WebhookDeliveryDocument>;

/**
 * How long a delivery row survives, in days, before Mongo's TTL index removes it. Same pattern as
 * `audit-logs`/`feedback`: read at import time, since the TTL index is created once at startup.
 */
const deliveryRetentionDays = environmentNumber('NODE_WEBHOOK_DELIVERY_RETENTION_DAYS', 30, 1);

/** Delivery collection schema. */
export const webhookDeliverySchema = new Schema<WebhookDeliveryDocument, WebhookDeliveryModel>(
    {
        tenant: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        subscriptionId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'WebhookSubscription'
        },
        eventId: {
            type: String,
            required: true
        },
        eventType: {
            type: String,
            required: true
        },
        payload: {
            type: Schema.Types.Mixed,
            required: true
        },
        attempt: {
            type: Number,
            required: true,
            default: 1
        },
        status: {
            type: String,
            enum: ['pending', 'in-flight', 'succeeded', 'exhausted'],
            required: true,
            default: 'pending'
        },
        responseCode: {
            type: Number
        },
        durationMs: {
            type: Number
        },
        error: {
            type: String
        },
        nextAttemptAt: {
            type: Date
        },
        leaseToken: {
            type: String
        },
        leaseExpiresAt: {
            type: Date
        }
    },
    { timestamps: true }
);

// The admin log's own filters (subscription, status), newest first.
webhookDeliverySchema.index({ tenant: 1, createdAt: -1 });
webhookDeliverySchema.index({ subscriptionId: 1, createdAt: -1 });
webhookDeliverySchema.index({ status: 1, createdAt: -1 });
// The retry sweep's own read: due, retryable rows, in no particular order — see `scripts/ops/sweep-webhook-retries.ts`.
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });
// The same read's other half: a STRANDED in-flight row whose lease already expired.
webhookDeliverySchema.index({ status: 1, leaseExpiresAt: 1 });

/*
 * TTL index — same caveat as every other TTL index in this repo (see `audit-logs/model.ts`):
 * Mongo will not modify `expireAfterSeconds` in place, so changing
 * `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` and restarting FAILS THE BOOT. `npm run db:sync` applies
 * it, by dropping the index and rebuilding it.
 */
webhookDeliverySchema.index(
    { createdAt: 1 },
    { expireAfterSeconds: deliveryRetentionDays * 24 * 60 * 60 }
);

/**
 * Wire shape: `_id` → `id`, drops `tenant` (implicit in who is asking), `payload` (not on the
 * contract — the log is about the attempt, not a payload replay viewer), and the lease pair
 * (`leaseToken`/`leaseExpiresAt`) — internal claim bookkeeping, not a fact about the attempt the
 * contract describes. Keeping the delivery-log response shape unchanged is deliberate: this is a
 * correctness fix to the CLAIM, not a new field anyone asked to see.
 */
export const applyWebhookDeliveryTransform = applySerialization(webhookDeliverySchema, {
    omit: ['tenant', 'payload', 'leaseToken', 'leaseExpiresAt']
});

/** Delivery model entrypoint. Collection name `webhookdeliveries`. */
export const webhookDeliveryModel = model<WebhookDeliveryDocument, WebhookDeliveryModel>(
    'WebhookDelivery',
    webhookDeliverySchema
);
