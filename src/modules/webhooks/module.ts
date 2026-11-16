/**
 * @module
 * Outbound webhooks: subscriptions, the delivery log, and the admin surface over both. Reacts to
 * every domain event a registered module's manifest names a `publicEvents` entry for
 * (`kernel/registry.ts`'s `PublicEventTarget`) via the domain-event bus — the reverse edge, so this
 * module never imports `orders`/`payments`, nor they it.
 * *
 * @see docs/modules/webhooks.md#its-neighbourhood
 * @see docs/modules/webhooks.md#the-delivery-path
 */

import path from 'node:path';
import { resolvePublicEvents, type AppModule } from '@kernel/registry';
import { logger } from '@infrastructure/adapters/logger';
import { isQueueEnabled } from '@infrastructure/adapters/queue';
import { WORKER_CHANNELS, WebhookDeliverJobPayloadSchema } from '@types';
import { router } from './routes';
import { webhooksService } from './services';
import { webhooksConfig } from './config';
import { webhooksJobs } from './jobs';

/**
 * Once every enabled module is known, collect their `publicEvents` declarations and subscribe —
 * `subscribe()` itself runs too early for this: the full module list the registry lookup
 * needs only exists by `onRegistered`, the same reason `locales`' `translatables` lookup is built
 * here rather than at `subscribe()` time.
 *
 * @param modules - every enabled module, in registration order
 */
const onRegistered = (modules: readonly AppModule[]): void => {
    webhooksService.subscribeToWebhookEvents(resolvePublicEvents(modules));
    webhooksService.registerWebhookCatalog(modules.map((appModule) => appModule.name));
    if (!isQueueEnabled())
        logger.warn({
            message:
                'webhooks: no message broker configured, so deliveries are sent by the retry sweep ' +
                '(npm run job sweep:webhook-retries, per minute) instead of at once'
        });
};

/** This module's manifest entry. */
export default {
    name: 'webhooks',
    mounts: [{ basePath: '/webhooks', routes: router }],
    jobs: webhooksJobs,
    locales: path.join(__dirname, 'locales'),
    onRegistered,
    /**
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
            handler: webhooksService.processDeliveryJob,
            schema: WebhookDeliverJobPayloadSchema,
            prefetch: 5
        }
    ],
    /** The secret-ring key, the subscription cap and the retention: see `./config`. */
    config: [webhooksConfig.slice],
    /** Every subscription's signing-secret ring is encrypted at rest. */
    reencrypt: webhooksService.reencryptWebhookSecrets,
    /**
     * `ownerUserId` on a subscription points at whoever configured the shop's integration — an
     * operator, not a `POST /account/export` subject. A pointer, never a copy: nothing here
     * duplicates personal data that `users` already owns, and no email is stored at all. The
     * pointer is forgotten when that account is erased; `collect` resolves nothing, so the
     * section appears in no export (the precedent is `account`'s `accountExports`).
     */
    personalData: [
        {
            section: 'webhookOwnership',
            collect: () => Promise.resolve(undefined),
            erase: ({ userId }, session) => webhooksService.forgetOwner(userId, session)
        }
    ]
} satisfies AppModule;
