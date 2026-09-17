/**
 * @module
 * Env-derived config read per call, not captured at import — the pattern `inventory/config.ts`
 * sets, so a deployment can change these without a restart.
 */

import { environmentNumber } from '@infrastructure/runtime/environment';

/**
 * The secret-ring encryption key, versioned the same way `account/session/config.ts`'s
 * `getTotpEncryptionKey` is — a single key today, with the version prefix already in every
 * ciphertext so a future rotation can decrypt old rows against their own key.
 */
export const getWebhookEncryptionKey = (): { version: string; key: string } => ({
    version: 'v1',
    key: process.env.NODE_WEBHOOK_SECRET_ENCRYPTION_KEY ?? ''
});

/**
 * How many subscriptions ONE tenant may hold — the fan-out guard this module exists for: one
 * event × N subscriptions is N deliveries, so an unbounded per-tenant count is an unbounded
 * fan-out cost per event. `services/subscriptions.ts` checks this against a `{ tenant }` count
 * before every create, then again by insertion rank after — see that module's own doc for why
 * one check alone can't close the race between two callers at the boundary.
 */
export const getWebhookSubscriptionCap = (): number =>
    environmentNumber('NODE_WEBHOOK_SUBSCRIPTION_CAP', 20, 1);

/**
 * The one hostname the SSRF guard (`@infrastructure/adapters/ssrf-guard`) may deliver to without
 * `https:` or a publicly-routable address — `NODE_WEBHOOK_DEMO_SINK_URL`'s host, so
 * `docker compose --profile integrations`'s `webhook-tester` (plain HTTP, a private compose-network
 * address) is reachable at all. `undefined` outside development/test even when the variable is
 * set: `src/kernel/required-config.ts` refuses to boot with it set under production, but this is
 * the second gate, for whichever `NODE_ENV` that check does not cover.
 *
 * @returns the hostname to exempt, or `undefined` when there is nothing to exempt
 */
export const getWebhookDemoAllowedHost = (): string | undefined => {
    const isDevelopmentOrTest =
        process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
    const sinkUrl = process.env.NODE_WEBHOOK_DEMO_SINK_URL;
    if (!isDevelopmentOrTest || !sinkUrl) return undefined;

    // eslint-disable-next-line no-restricted-syntax -- URL's constructor has no non-throwing form; a malformed sink URL means no exemption, not a crash
    try {
        return new URL(sinkUrl).hostname;
    } catch {
        return undefined;
    }
};
