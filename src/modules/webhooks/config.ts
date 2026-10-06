/**
 * @module
 * Env-derived config read per call, not captured at import — the pattern `inventory/config.ts`
 * sets, so a test can vary these per case. A deployment changes one with a restart.
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, versionedKeyRing } from '@infrastructure/config/fields';
import type { VersionedKey } from '@infrastructure/security/versioned-secret';

/**
 * Webhook delivery configuration.
 *
 * A subscription's secret ring is encrypted under `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`
 * (`./secrets.ts`); the shipped placeholder would make every stored secret recoverable by anyone
 * who has read this repo — same failure shape `NODE_TOTP_ENCRYPTION_KEY` guards against, same fix.
 */
export const webhooksConfig = defineConfig({
    name: 'webhooks',
    shape: {
        NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: versionedKeyRing({
            required: {
                minLength: 16,
                minBytes: 32,
                placeholder: 'your-webhook-secret-encryption-key-here'
            },
            describe: 'Ring encrypting stored subscription secrets, `version:key`, newest first.'
        }),
        NODE_WEBHOOK_SUBSCRIPTION_CAP: int({
            default: 20,
            min: 1,
            describe: 'Subscriptions one tenant may hold — the fan-out guard.'
        }),
        NODE_WEBHOOK_SECRET_OVERLAP_HOURS: int({
            default: 24,
            min: 1,
            describe:
                'Hours a superseded secret keeps signing after a rotation. A ring holds at most two.'
        }),
        NODE_WEBHOOK_DELIVERY_RETENTION_DAYS: int({
            default: 30,
            min: 1,
            describe: 'Days a delivery row is kept. Changing it needs `db:sync`.'
        })
    }
});

/**
 * The secret-ring encryption key ring, parsed the same way `account/session/config.ts`'s
 * `getTotpEncryptionKeyRing` is — see `parseVersionedKeyRing` for the env var's wire format.
 */
export const getWebhookEncryptionKeyRing = (): VersionedKey[] =>
    webhooksConfig().NODE_WEBHOOK_SECRET_ENCRYPTION_KEY;

/**
 * How many subscriptions ONE tenant may hold — the fan-out guard this module exists for: one
 * event × N subscriptions is N deliveries, so an unbounded per-tenant count is an unbounded
 * fan-out cost per event. `services/subscriptions.ts` checks this against a `{ tenant }` count
 * before every create, then again by insertion rank after — see that module's own doc for why
 * one check alone can't close the race between two callers at the boundary.
 */
export const getWebhookSubscriptionCap = (): number =>
    webhooksConfig().NODE_WEBHOOK_SUBSCRIPTION_CAP;

/**
 * How long, in milliseconds, a superseded ring secret keeps signing after the secret that replaced
 * it was minted — the Standard Webhooks bounded overlap.
 */
export const getWebhookSecretOverlapMs = (): number =>
    webhooksConfig().NODE_WEBHOOK_SECRET_OVERLAP_HOURS * 3_600_000;

/**
 * How long a delivery row survives, in days, before Mongo's TTL index removes it. Read at import
 * time by the model, since the TTL index is created once at startup.
 */
export const getWebhookDeliveryRetentionDays = (): number =>
    webhooksConfig().NODE_WEBHOOK_DELIVERY_RETENTION_DAYS;
