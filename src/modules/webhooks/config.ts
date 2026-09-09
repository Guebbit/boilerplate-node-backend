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
