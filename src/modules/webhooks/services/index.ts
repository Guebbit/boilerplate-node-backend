/**
 * @module
 * This module's `services/` — see `docs/theory/layers.md#when-service-ts-becomes-services-` for
 * when a module gets one of these instead of a single `service.ts`. Split by what the operations
 * DO: `subscriptions.ts` and `deliveries.ts` are the admin surface's two resources, `attempt.ts` is
 * the delivery core both `deliveries.ts`'s replay and the queued worker share, `sweep.ts` is the
 * retry sweep `ops/sweep-webhook-retries.ts` runs, `publish.ts` is the domain-event fan-out, and
 * `context.ts` is the one thing every one of them needs from a caller.
 */

import * as subscriptions from './subscriptions';
import * as deliveries from './deliveries';

export { subscribeToWebhookEvents } from './publish';
export { sweepDueWebhookDeliveries } from './sweep';
export { processDeliveryJob } from './attempt';
export { listWebhookEventCatalogue, type WebhookEventCatalogueEntry } from './catalogue';
export type { SubscriptionWithMintedSecrets } from './subscriptions';
export type { DeliveryListFilters } from './deliveries';

/** The module's barrel export — controllers call through this, never the bare functions. */
export const webhooksService = {
    listSubscriptions: subscriptions.list,
    createSubscription: subscriptions.create,
    updateSubscription: subscriptions.update,
    removeSubscription: subscriptions.remove,
    listDeliveries: deliveries.list,
    replayDelivery: deliveries.replay
};
