/**
 * @module
 * The two places this module's documents become wire shapes — one per resource, since webhooks
 * serves both a subscription and its delivery log. `create`/`rotate-secret` layer a one-time
 * plaintext secret on top of {@link presentWebhookSubscription}; every other subscription read
 * and the delivery reads answer with these alone.
 */

import type { WebhookSubscription, WebhookDelivery } from '@types';
import type { WebhookSubscriptionDocument, WebhookDeliveryDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` transform; the document is typed as stored, not as
 * the wire shape `WebhookSubscription` promises.
 */
export const presentWebhookSubscription = (
    document: WebhookSubscriptionDocument
): WebhookSubscription => document.toJSON() as WebhookSubscription;

/**
 * `.toJSON()` applies the model's `_id` → `id` transform; the document is typed as stored, not as
 * the wire shape `WebhookDelivery` promises.
 */
export const presentWebhookDelivery = (document: WebhookDeliveryDocument): WebhookDelivery =>
    document.toJSON() as WebhookDelivery;
