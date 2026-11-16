/**
 * @module
 * The `/webhooks` router — subscriptions, the delivery log, replay, and the public event
 * catalogue. Every route sits behind a `<action>:WebhookSubscription` rule — read to list, create
 * to add, update to change a subscription or replay a delivery, delete to remove one; there is no
 * public route here, unlike `tasks`'s `/contact`.
 */

import { Router } from 'express';
import { getAuth, isAuthOrCredential, requirePermission } from '@kernel/middlewares/authorizations';
import { listWebhookSubscriptions } from './controllers/get-subscriptions';
import { createWebhookSubscription } from './controllers/post-subscription';
import {
    replaceWebhookSubscription,
    updateWebhookSubscription
} from './controllers/update-subscription';
import { createWebhookSubscriptionSecret } from './controllers/post-subscription-secret';
import { deleteWebhookSubscriptionSecret } from './controllers/delete-subscription-secret';
import { deleteWebhookSubscription } from './controllers/delete-subscription';
import { getWebhookSubscription } from './controllers/get-subscription';
import { enableWebhookSubscription } from './controllers/post-subscription-enable';
import { disableWebhookSubscription } from './controllers/post-subscription-disable';
import { listWebhookDeliveries } from './controllers/get-deliveries';
import { getWebhookDelivery } from './controllers/get-delivery';
import { replayWebhookDelivery } from './controllers/post-delivery-replay';
import { listWebhookEvents } from './controllers/get-events';

/** Express router for the webhooks admin surface. */
export const router = Router();

/**
 * `isAuthOrCredential`, not `isAuth`: an `sk_...` api key may reach this module.
 * Subscription management for machine consumers. Serving the machines is what this
 * module exists to do.
 */
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

// GET /webhooks/subscriptions/:id — one subscription
router.get(
    '/subscriptions/:id',
    requirePermission('read', 'WebhookSubscription'),
    getWebhookSubscription
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

// POST /webhooks/subscriptions/:id/enable — switch it back on, whatever switched it off
router.post(
    '/subscriptions/:id/enable',
    requirePermission('update', 'WebhookSubscription'),
    enableWebhookSubscription
);

// POST /webhooks/subscriptions/:id/disable — pause it by hand
router.post(
    '/subscriptions/:id/disable',
    requirePermission('update', 'WebhookSubscription'),
    disableWebhookSubscription
);

// POST /webhooks/subscriptions/:id/secrets — add a new ring secret; the old one stays active
router.post(
    '/subscriptions/:id/secrets',
    requirePermission('update', 'WebhookSubscription'),
    createWebhookSubscriptionSecret
);

// DELETE /webhooks/subscriptions/:id/secrets/:secretId — drop one ring secret, the rotation's end
router.delete(
    '/subscriptions/:id/secrets/:secretId',
    requirePermission('update', 'WebhookSubscription'),
    deleteWebhookSubscriptionSecret
);

// GET /webhooks/deliveries — the delivery log, newest first
router.get('/deliveries', requirePermission('read', 'WebhookSubscription'), listWebhookDeliveries);

// GET /webhooks/deliveries/:id — one delivery of the log
router.get('/deliveries/:id', requirePermission('read', 'WebhookSubscription'), getWebhookDelivery);

// POST /webhooks/deliveries/:id/replay — re-send one delivery now
router.post(
    '/deliveries/:id/replay',
    requirePermission('update', 'WebhookSubscription'),
    replayWebhookDelivery
);

// GET /webhooks/events — the public event catalogue a subscription may filter on
router.get('/events', requirePermission('read', 'WebhookSubscription'), listWebhookEvents);
