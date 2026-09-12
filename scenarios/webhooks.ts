/**
 * @module
 * The webhooks module's slice of the demo dataset — the one entry in `scenarios/index.ts`'s table
 * that seeds nothing by default. A demo subscription pointing at `webhook-tester`
 * (`docker-compose.yml`'s `integrations` profile) is a FIXTURE, not code, per
 * `docs/modules/webhooks.md`'s "Seeing it work" section: it reads the sink's base url from
 * `NODE_WEBHOOK_DEMO_SINK_URL` and seeds nothing when that is unset, so a developer who never
 * enables the profile never gets a dead subscription auto-disabling in their logs — the same
 * inert-by-default shape as `@infrastructure/adapters/demo-outbox.ts`.
 *
 * Reachable at all only because `@infrastructure/adapters/ssrf-guard`'s one exemption
 * (`@modules/webhooks/config`'s `getWebhookDemoAllowedHost`) lets THIS ONE hostname through
 * without `https:` or a public address — `webhook-tester` is plain HTTP on a private compose
 * address, which the guard refuses for everyone else. Honoured only in development/test.
 *
 * A fixed session id, not a generated one: `webhook-tester`'s `AUTO_CREATE_SESSIONS=true` means a
 * POST to `/<any-uuid>` creates that session on arrival, so this subscription is watchable without
 * a human opening the UI first to obtain one — `GET /api/session/<uuid>/requests` on the tester
 * answers with what it has captured.
 *
 * The secret ring holds a FIXED plaintext (`WEBHOOK_DEMO_SECRET`), not one `mintRingSecret()`
 * would generate: that mints a secret this file could never read back — `secrets.ts`'s own
 * docblock says the plaintext exists only in the response that minted it — so nothing could ever
 * hand it to `webhook-tester` for signature verification. Demo-only; never used for a real ring.
 */

import { Types } from 'mongoose';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { encryptRingSecret } from '@modules/webhooks/secrets';
import type { WebhookSubscriptionDocument, WebhookSecretRingEntry } from '@modules/webhooks/model';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';

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
export const WEBHOOK_DEMO_SECRET =
    'whsec_ZGVtby13ZWJob29rLXNlY3JldC1kby1ub3QtdXNlLWluLXByb2R1Y3Rpb24=';

/** Every fixture here shares this timestamp, matching the rest of the scenario's convention. */
const SEED_DATE = new Date('2026-01-01T00:00:00.000Z');

/**
 * Seed the scenario's webhook subscription. Declared in `./index`'s `shopModules`; walked by
 * `seedShop`.
 *
 * Seeds nothing when `NODE_WEBHOOK_DEMO_SINK_URL` is unset, the default.
 */
export const seedWebhooksCollection = (): Promise<SeedOutcome[]> => {
    const sinkBaseUrl = process.env.NODE_WEBHOOK_DEMO_SINK_URL;
    if (!sinkBaseUrl) return Promise.resolve([]);

    const entry: WebhookSecretRingEntry = {
        id: WEBHOOK_DEMO_SECRET_ID,
        ciphertext: encryptRingSecret(WEBHOOK_DEMO_SECRET),
        createdAt: SEED_DATE
    };
    const fixture = {
        _id: new Types.ObjectId(WEBHOOK_SUBSCRIPTION_ID),
        tenant: DEPLOYMENT_TENANT_ID,
        url: `${sinkBaseUrl.replace(/\/+$/, '')}/${WEBHOOK_SESSION_ID}`,
        description: 'Demo sink (webhook-tester)',
        eventTypes: ['*'],
        enabled: true,
        consecutiveFailures: 0,
        secrets: [entry],
        createdAt: SEED_DATE,
        updatedAt: SEED_DATE
    } as WebhookSubscriptionDocument;

    return insertIfAbsent(webhookSubscriptionRepository, fixture).then((outcome) => [outcome]);
};
