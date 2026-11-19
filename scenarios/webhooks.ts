/**
 * @module
 * The webhooks module's slice of the demo dataset: the one `shopModules` entry that seeds nothing
 * by default.
 *
 * Fixture:  a demo subscription pointing at the sink (`webhook-tester` behind
 *           `webhook-tester-tls`, `compose.override.yaml`'s `integrations` profile, or the
 *           frontend's Cypress listener). It reads the base url from `NODE_WEBHOOK_DEMO_SINK_URL`
 *           and seeds nothing when unset, so a developer who never enables the profile never gets
 *           a dead subscription auto-disabling in their logs. Same inert-by-default shape as
 *           `scenarios/support/doubles/mail-outbox.ts`.
 * URL:      `https://` like every webhook URL, so the edit form can save it. Reachable only
 *           because the development doubles register the sink's origin with
 *           `@infrastructure/adapters/ssrf-guard` (`scenarios/support/doubles/webhook-sink.ts`),
 *           letting THIS ONE origin through although it is on loopback. The sink's certificate is
 *           the test CA's (`scenarios/support/tls/`), trusted by those doubles.
 * Session:  a fixed id: `webhook-tester`'s `AUTO_CREATE_SESSIONS=true` creates a session on the
 *           first POST to `/<any-uuid>`, so no human opens the UI first to watch it.
 * Secret:   a FIXED plaintext (`WEBHOOK_DEMO_SECRET`), not `mintRingSecret()`'s: that plaintext
 *           exists only in the response that minted it (`secrets.ts`), so this file could never
 *           hand it to `webhook-tester` for signature checks. Demo-only; never a real ring.
 *
 * @see docs/modules/webhooks.md#seeing-it-work
 */

import { Types } from 'mongoose';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { encryptRingSecret } from '@modules/webhooks/secrets';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';
import { demoSinkConfig } from '@scenarios/config';

/** The fixed `_id` this subscription is upserted under, so re-seeding is a no-op like every other fixture. */
const WEBHOOK_SUBSCRIPTION_ID = '65e0000000000000000000a1';

/** A fixed, valid-shaped session id — see the module docblock. */
const WEBHOOK_SESSION_ID = '4b1d9e2a-6f3c-4a8e-9d1b-2c7a5e6f9b3d';

/** The fixed id of the one ring entry below — a UUID literal, matching `mintRingSecret`'s shape. */
const WEBHOOK_DEMO_SECRET_ID = '7f3b8e21-4a6d-4c9f-9e12-3d5a7b8c9f01';

/**
 * The demo subscription's one ring secret, plaintext, Standard-Webhooks-shaped
 * (`secrets.ts`'s `generatePlaintextSecret`) — decode the base64 half and it reads
 * "demo-webhook-secret-do-not-use-in-production". Documented in `.env-example` next to
 * `NODE_WEBHOOK_DEMO_SINK_URL`, so verifying a captured delivery's `webhook-signature` header
 * against it is a copy-paste, not a mystery.
 */
const WEBHOOK_DEMO_SECRET = 'whsec_ZGVtby13ZWJob29rLXNlY3JldC1kby1ub3QtdXNlLWluLXByb2R1Y3Rpb24=';

/**
 * Seed the scenario's webhook subscription. Collected into `shopModules` (`./shop-modules`); run by
 * `seedShop`.
 *
 * Seeds nothing when `NODE_WEBHOOK_DEMO_SINK_URL` is unset, the default.
 */
export const seedWebhooksCollection = (): Promise<SeedOutcome[]> => {
    const sinkBaseUrl = demoSinkConfig().NODE_WEBHOOK_DEMO_SINK_URL;
    if (!sinkBaseUrl) return Promise.resolve([]);

    /**
     * `createdAt` is set here to satisfy the ring entry's type; Mongoose keeps a `createdAt` that
     * is given, so this value is the one stored.
     */
    const entry = {
        id: WEBHOOK_DEMO_SECRET_ID,
        ciphertext: encryptRingSecret(WEBHOOK_DEMO_SECRET, WEBHOOK_DEMO_SECRET_ID),
        createdAt: new Date()
    };
    const fixture = {
        _id: new Types.ObjectId(WEBHOOK_SUBSCRIPTION_ID),
        tenant: DEPLOYMENT_TENANT_ID,
        url: `${sinkBaseUrl.replace(/\/+$/, '')}/${WEBHOOK_SESSION_ID}`,
        description: 'Demo sink (webhook-tester)',
        eventTypes: ['*'],
        consecutiveFailures: 0,
        secrets: [entry]
    };

    return insertIfAbsent(webhookSubscriptionRepository, fixture).then((outcome) => [outcome]);
};

/**
 * This module's entry in the `shop` fixture table. Picked up by `npm run regenerate`
 * (`scenarios/shop-modules.generated.ts`), so deleting this file deletes the entry.
 */
export const shopModule = { seed: seedWebhooksCollection };
