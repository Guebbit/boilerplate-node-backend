/**
 * @module
 * Env-derived config read per call, not captured at import — the pattern `inventory/config.ts`
 * sets, so a test can vary these per case. A deployment changes one with a restart.
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text, versionedKeyRing } from '@infrastructure/config/fields';
import { isRelaxedEnvironment } from '@infrastructure/runtime/config';
import type { VersionedKey } from '@infrastructure/security/versioned-secret';

/**
 * Webhook delivery configuration.
 *
 * A subscription's secret ring is encrypted under `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`
 * (`./secrets.ts`); the shipped placeholder would make every stored secret recoverable by anyone
 * who has read this repo — same failure shape `NODE_TOTP_ENCRYPTION_KEY` guards against, same fix.
 *
 * `NODE_WEBHOOK_DEMO_SINK_URL` is the one variable in this repo that must be ABSENT outside
 * development/test — see {@link getWebhookDemoAllowedHost} for the second, narrower gate.
 */
export const webhooksConfig = defineConfig({
    name: 'webhooks',
    shape: {
        NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: versionedKeyRing({
            required: {
                minLength: 16,
                placeholder: 'your-webhook-secret-encryption-key-here'
            },
            describe: 'Ring encrypting stored subscription secrets, `version:key`, newest first.'
        }),
        NODE_WEBHOOK_SUBSCRIPTION_CAP: int({
            default: 20,
            min: 1,
            describe: 'Subscriptions one tenant may hold — the fan-out guard.'
        }),
        NODE_WEBHOOK_DELIVERY_RETENTION_DAYS: int({
            default: 30,
            min: 1,
            describe: 'Days a delivery row is kept. Changing it needs `db:sync`.'
        }),
        NODE_WEBHOOK_DEMO_SINK_URL: text({
            forbiddenOutsideRelaxed: true,
            describe:
                'The demo webhook tester; its host is exempt from the SSRF guard. Development/test only.'
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
 * How long a delivery row survives, in days, before Mongo's TTL index removes it. Read at import
 * time by the model, since the TTL index is created once at startup.
 */
export const getWebhookDeliveryRetentionDays = (): number =>
    webhooksConfig().NODE_WEBHOOK_DELIVERY_RETENTION_DAYS;

/**
 * The one hostname the SSRF guard (`@infrastructure/adapters/ssrf-guard`) may deliver to without
 * `https:` or a publicly-routable address — `NODE_WEBHOOK_DEMO_SINK_URL`'s host, so
 * `docker compose --profile integrations`'s `webhook-tester` (plain HTTP, a private compose-network
 * address) is reachable at all. `undefined` outside development/test even when the variable is
 * set: `infrastructure/config/define.ts` refuses to boot with it set there too, and this is the
 * second gate.
 *
 * @returns the hostname to exempt, or `undefined` when there is nothing to exempt
 */
export const getWebhookDemoAllowedHost = (): string | undefined => {
    const sinkUrl = webhooksConfig().NODE_WEBHOOK_DEMO_SINK_URL;
    if (!isRelaxedEnvironment() || !sinkUrl) return undefined;

    // eslint-disable-next-line no-restricted-syntax -- URL's constructor has no non-throwing form; a malformed sink URL means no exemption, not a crash
    try {
        return new URL(sinkUrl).hostname;
    } catch {
        return undefined;
    }
};
