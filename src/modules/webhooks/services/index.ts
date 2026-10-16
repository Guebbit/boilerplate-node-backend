/**
 * @module
 * This module's `services/` — see `docs/theory/layers.md#when-service-ts-becomes-services-` for
 * when a module gets one of these instead of a single `service.ts`. Split by what the operations
 * DO: `subscriptions.ts` and `deliveries.ts` are the admin surface's two resources, `attempt.ts` is
 * the delivery core both `deliveries.ts`'s replay and the queued worker share, `sweep.ts` is the
 * retry sweep `sweep:webhook-retries` runs, and `publish.ts` is the domain-event fan-out.
 */

import * as subscriptions from './subscriptions';
import * as deliveries from './deliveries';
import { subscribeToWebhookEvents } from './publish';
import { sweepDueWebhookDeliveries } from './sweep';
import { reencryptWebhookSecrets } from './reencrypt';
import { processDeliveryJob } from './attempt';
import { listWebhookEventCatalogue, registerWebhookCatalogue } from './catalogue';

export type { WebhookEventCatalogueEntry } from '@types';
export type { SubscriptionWithMintedSecrets } from './subscriptions';
export type { DeliveryListFilters } from './deliveries';

/** The module's barrel export — controllers call through this, never the bare functions. */
export const webhooksService = {
    listSubscriptions: subscriptions.list,
    createSubscription: subscriptions.create,
    updateSubscription: subscriptions.update,
    rotateSubscriptionSecret: subscriptions.rotateSecret,
    removeSubscriptionSecret: subscriptions.removeSecret,
    removeSubscription: subscriptions.remove,
    listDeliveries: deliveries.list,
    replayDelivery: deliveries.replay,
    subscribeToWebhookEvents,
    sweepDueWebhookDeliveries,
    reencryptWebhookSecrets,
    processDeliveryJob,
    listWebhookEventCatalogue,
    registerWebhookCatalogue
};
