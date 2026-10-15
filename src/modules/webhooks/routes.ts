/**
 * @module
 * The `/webhooks` router — subscriptions, the delivery log, replay, and the public event
 * catalogue. Every route sits behind a `webhooks.*` key — read to list, create to add, update
 * to change a subscription or replay a delivery, delete to remove one; there is no public
 * route here, unlike `feedback`'s `/contact`.
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { listWebhookSubscriptions } from './controllers/list-subscriptions';
import { createWebhookSubscription } from './controllers/create-subscription';
import {
    replaceWebhookSubscription,
    updateWebhookSubscription
} from './controllers/update-subscription';
import { rotateWebhookSubscriptionSecret } from './controllers/rotate-subscription-secret';
import { removeWebhookSubscriptionSecret } from './controllers/remove-subscription-secret';
import { deleteWebhookSubscription } from './controllers/delete-subscription';
import { listWebhookDeliveries } from './controllers/list-deliveries';
import { replayWebhookDelivery } from './controllers/replay-delivery';
import { listWebhookEvents } from './controllers/list-events';

/** Express router for the webhooks admin surface. */
export const router = Router();

// `isAuthOrCredential`, not `isAuth`: an `sk_...` api key may reach this module.
// Subscription management for machine consumers. Serving the machines is what this
// module exists to do.
router.use(getAuth, isAuthOrCredential);

// GET /webhooks/subscriptions — list this tenant's subscriptions
router.get(
    '/subscriptions',
    requirePermission('read', 'WebhookSubscription'),
    listWebhookSubscriptions
);

// POST /webhooks/subscriptions — create one
router.post(
    '/subscriptions',
    requirePermission('create', 'WebhookSubscription'),
    createWebhookSubscription
);

// PUT /webhooks/subscriptions/:id — replace the whole subscription
router.put(
    '/subscriptions/:id',
    requirePermission('update', 'WebhookSubscription'),
    replaceWebhookSubscription
);

// PATCH /webhooks/subscriptions/:id — change the fields sent
router.patch(
    '/subscriptions/:id',
    requirePermission('update', 'WebhookSubscription'),
    updateWebhookSubscription
);

// DELETE /webhooks/subscriptions/:id — remove the subscription
router.delete(
    '/subscriptions/:id',
    requirePermission('delete', 'WebhookSubscription'),
    deleteWebhookSubscription
);

// POST /webhooks/subscriptions/:id/rotate-secret — add a new ring secret; the old one stays active
router.post(
    '/subscriptions/:id/rotate-secret',
    requirePermission('update', 'WebhookSubscription'),
    rotateWebhookSubscriptionSecret
);

// DELETE /webhooks/subscriptions/:id/secrets/:secretId — drop one ring secret, the rotation's end
router.delete(
    '/subscriptions/:id/secrets/:secretId',
    requirePermission('update', 'WebhookSubscription'),
    removeWebhookSubscriptionSecret
);

// GET /webhooks/deliveries — the delivery log, newest first
router.get('/deliveries', requirePermission('read', 'WebhookSubscription'), listWebhookDeliveries);

// POST /webhooks/deliveries/:id/replay — re-send one delivery now
router.post(
    '/deliveries/:id/replay',
    requirePermission('update', 'WebhookSubscription'),
    replayWebhookDelivery
);

// GET /webhooks/events — the public event catalogue a subscription may filter on
router.get('/events', requirePermission('read', 'WebhookSubscription'), listWebhookEvents);
