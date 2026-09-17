/**
 * @module
 * Outbound webhooks: subscriptions, the delivery log, and the admin surface over both. Reacts to
 * `order.created`, `order.status_changed` (filtered to `paid`/`shipped`), `order.cancelled`,
 * `payment.succeeded` and `payment.failed` via the domain-event bus — the reverse edge described in
 * `docs/modules/webhooks.md`, so `orders`/`payments` never import this module.
 *
 * Declares its own queue consumer below, rather than `app/workers.ts` naming `WEBHOOK_QUEUE`
 * directly — see `ModuleConsumer` (`@kernel/registry.ts`). Deleting this module is then enough to
 * stop the queue meaning anything, with nothing left to also delete in `app/`.
 *
 * See: docs/modules/webhooks.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { WORKER_CHANNELS, WebhookDeliverJobPayloadSchema } from '@types';
import { router } from './routes';
import { subscribeToWebhookEvents, processDeliveryJob } from './services';

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
    permissions: [
        'webhooks.any.read',
        'webhooks.any.create',
        'webhooks.any.update',
        'webhooks.any.delete'
    ],
    subscribe: subscribeToWebhookEvents,
    /*
     * `handler: processDeliveryJob` directly, no separate guard in front of it: `schema` below
     * already refuses a job missing any required field before `consumeFromQueue` ever calls the
     * handler (`infrastructure/adapters/queue.ts`'s `handleDelivery`), so a check repeating that
     * here would be dead weight. `prefetch: 5` — one signed POST per job, I/O-bound like email, and
     * a dead endpoint's hard timeout (`transport/webhook-delivery.ts`) must not let a burst of jobs
     * pile up serially.
     */
    consumers: [
        {
            queue: WORKER_CHANNELS.WEBHOOK_DELIVER,
            handler: processDeliveryJob,
            schema: WebhookDeliverJobPayloadSchema,
            prefetch: 5
        }
    ],
    requiredConfig: [
        // A subscription's secret ring is encrypted under this key (`./secrets.ts`); the shipped
        // placeholder would make every stored secret recoverable by anyone who has read this repo —
        // same failure shape `NODE_TOTP_ENCRYPTION_KEY` guards against, same fix.
        {
            key: 'NODE_WEBHOOK_SECRET_ENCRYPTION_KEY',
            minLength: 16,
            placeholder: 'your-webhook-secret-encryption-key-here'
        }
    ],
    // The one variable in this repo that must be ABSENT under NODE_ENV=production — see
    // `kernel/required-config.ts`'s `forbiddenUnderProduction` for the generic check, and
    // `config.ts`'s `getWebhookDemoAllowedHost` for the second, narrower gate this backs up.
    forbiddenInProduction: ['NODE_WEBHOOK_DEMO_SINK_URL']
} satisfies AppModule;
