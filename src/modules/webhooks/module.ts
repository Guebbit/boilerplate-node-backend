/**
 * @module
 * Outbound webhooks: subscriptions, the delivery log, and the admin surface over both. Reacts to
 * every domain event a registered module's manifest names a `publicEvents` entry for
 * (`kernel/registry.ts`'s `PublicEventTarget`, DDD-D4) via the domain-event bus — the reverse edge
 * described in `docs/modules/webhooks.md`, so this module never imports `orders`/`payments`, nor
 * they it.
 *
 * Declares its own queue consumer below, rather than `app/workers.ts` naming
 * `WORKER_CHANNELS.WEBHOOK_DELIVER` directly — see `ModuleConsumer` (`@kernel/registry.ts`).
 * Deleting this module is then enough to stop the queue meaning anything, with nothing left to
 * also delete in `app/`.
 *
 * See: docs/modules/webhooks.md
 */

import path from 'node:path';
import { resolvePublicEvents, type AppModule } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { isQueueEnabled } from '@infrastructure/adapters/queue';
import { WORKER_CHANNELS, WebhookDeliverJobPayloadSchema } from '@types';
import { router } from './routes';
import { subscribeToWebhookEvents, processDeliveryJob } from './services';
import { webhooksConfig } from './config';

/**
 * Once every enabled module is known, collect their `publicEvents` declarations and subscribe —
 * `subscribe()` itself runs too early for this: the full module list DDD-D4's registry lookup
 * needs only exists by `onRegistered`, the same reason `locales`' `translatables` lookup is built
 * here rather than at `subscribe()` time.
 *
 * @param modules - every enabled module, in registration order
 */
const onRegistered = (modules: readonly AppModule[]): void => {
    subscribeToWebhookEvents(resolvePublicEvents(modules));
    if (!isQueueEnabled())
        logger.warn({
            message:
                'webhooks: no message broker configured, so deliveries are sent by the retry sweep ' +
                '(npm run sweep:webhook-retries, per minute) instead of at once'
        });
};

/** This module's manifest entry. */
export default {
    name: 'webhooks',
    basePath: '/webhooks',
    routes: router,
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates'),
    onRegistered,
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
    // The secret-ring key, retention and the demo-sink gate: see `./config`.
    config: [webhooksConfig.slice],
    // `ownerUserId` on a subscription points at whoever configured the shop's integration — an
    // operator, not a `POST /account/export` subject. A pointer, never a copy: nothing here
    // duplicates personal data that `users` already owns, and no email is stored at all.
    personalData: 'none'
} satisfies AppModule;
