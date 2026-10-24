/**
 * @module
 * The two places this module's documents become wire shapes — one per resource, since webhooks
 * serves both a subscription and its delivery log. `create`/`rotate-secret` layer a one-time
 * plaintext secret on top of {@link presentWebhookSubscription}; every other subscription read
 * and the delivery reads answer with these alone.
 */

import type {
    WebhookSubscription,
    WebhookSubscriptionActions,
    WebhookDelivery,
    WebhookDeliveryActions
} from '@types';
import type { StoredWebhookSubscription } from './repository';
import type { WebhookSubscriptionDocument, WebhookDeliveryDocument } from './model';

/**
 * `.toJSON()` applies the model's transform (`_id` → `id`, the ring collapsed to `secretIds`, the
 * derived `enabled`); the document is typed as stored, not as the wire shape. The caller's
 * `actions` arrive finished, from `services/actions.ts`.
 *
 * @param document - the stored subscription
 * @param actions - what this caller may do to it
 */
export const presentWebhookSubscription = (
    document: WebhookSubscriptionDocument,
    actions: WebhookSubscriptionActions
): WebhookSubscription => ({
    ...(document.toJSON() as StoredWebhookSubscription),
    actions
});

/**
 * `.toJSON()` applies the model's `_id` → `id` transform; the document is typed as stored, not as
 * the wire shape `WebhookDelivery` promises. The caller's `actions` arrive finished.
 *
 * @param document - the stored delivery
 * @param actions - what this caller may do to it
 */
export const presentWebhookDelivery = (
    document: WebhookDeliveryDocument,
    actions: WebhookDeliveryActions
): WebhookDelivery => ({ ...(document.toJSON() as Omit<WebhookDelivery, 'actions'>), actions });
