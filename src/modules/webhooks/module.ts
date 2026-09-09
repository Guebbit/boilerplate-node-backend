/**
 * @module
 * Outbound webhooks: subscriptions, the delivery log, and the admin surface over both. Reacts to
 * `order.created`, `order.status_changed` (filtered to `paid`/`shipped`), `order.cancelled`,
 * `payment.succeeded` and `payment.failed` via the domain-event bus — the reverse edge described in
 * `docs/modules/webhooks.md`, so `orders`/`payments` never import this module.
 *
 * Installs itself as `webhook.worker.ts`'s job processor at import time — same "infra cannot import
 * a module, so the module registers into infra" shape `registerAuditSink`/
 * `registerImageWritebackResolver` already establish. Deleting this module is then enough to stop
 * the queue meaning anything, with nothing left to also delete in `infrastructure/`.
 *
 * See: docs/modules/webhooks.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { registerWebhookDeliveryProcessor } from '@infrastructure/adapters/webhook.worker';
import { router } from './routes';
import { subscribeToWebhookEvents, processDeliveryJob } from './services';

// Installs the queue processor — see the module header for why here, not `app/workers.ts`.
registerWebhookDeliveryProcessor(processDeliveryJob);

/** This module's manifest entry. */
export default {
    name: 'webhooks',
    basePath: '/webhooks',
    routes: router,
    locales: path.join(__dirname, 'locales'),
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone.
     */
    permissions: ['webhooks.read', 'webhooks.manage'],
    subscribe: subscribeToWebhookEvents,
    requiredConfig: [
        // A subscription's secret ring is encrypted under this key (`./secrets.ts`); the shipped
        // placeholder would make every stored secret recoverable by anyone who has read this repo —
        // same failure shape `NODE_TOTP_ENCRYPTION_KEY` guards against, same fix.
        {
            key: 'NODE_WEBHOOK_SECRET_ENCRYPTION_KEY',
            minLength: 16,
            placeholder: 'your-webhook-secret-encryption-key-here'
        }
    ]
} satisfies AppModule;
