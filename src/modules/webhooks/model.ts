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
        // Lower-cased/trimmed like `locales/model.ts`'s own `tenant` field — the convention this
        // repo already uses for "whose row this is" outside a foreign-key relationship.
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
    omit: ['tenant'],
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
 * `in-flight` is the atomic claim `repository.ts`'s `claimPending` makes before a worker actually
 * calls the endpoint — it exists so the sweep and a fast-path worker racing the same due row
 * cannot both deliver it, never as a state a caller sets directly. `failed` is unused today
 * (a failed attempt with retries left goes back to `pending` with a later `nextAttemptAt`; only
 * `exhausted` is terminal) and kept for a future per-attempt row without a contract change.
 */
export type WebhookDeliveryStatus = 'pending' | 'in-flight' | 'succeeded' | 'failed' | 'exhausted';

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
            enum: ['pending', 'in-flight', 'succeeded', 'failed', 'exhausted'],
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
        }
    },
    { timestamps: true }
);

// The admin log's own filters (subscription, status), newest first.
webhookDeliverySchema.index({ tenant: 1, createdAt: -1 });
webhookDeliverySchema.index({ subscriptionId: 1, createdAt: -1 });
webhookDeliverySchema.index({ status: 1, createdAt: -1 });
// The retry sweep's own read: due, retryable rows, in no particular order — see `ops/sweep-webhook-retries.ts`.
webhookDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

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

/** Wire shape: `_id` → `id`, drops `tenant` (implicit in who is asking) and `payload` (not on the contract — the log is about the attempt, not a payload replay viewer). */
export const applyWebhookDeliveryTransform = applySerialization(webhookDeliverySchema, {
    omit: ['tenant', 'payload']
});

/** Delivery model entrypoint. Collection name `webhookdeliveries`. */
export const webhookDeliveryModel = model<WebhookDeliveryDocument, WebhookDeliveryModel>(
    'WebhookDelivery',
    webhookDeliverySchema
);
