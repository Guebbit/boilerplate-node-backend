/**
 * @module
 * The `/webhooks` router — subscriptions, the delivery log, replay, and the public event
 * catalogue. Every route sits behind a `webhooks.*` key — read to list, create to add, update
 * to change a subscription or replay a delivery, delete to remove one; there is no public
 * route here, unlike `feedback`'s `/contact`.
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { listWebhookSubscriptions } from './controllers/list-subscriptions';
import { createWebhookSubscription } from './controllers/create-subscription';
import { updateWebhookSubscription } from './controllers/update-subscription';
import { deleteWebhookSubscription } from './controllers/delete-subscription';
import { listWebhookDeliveries } from './controllers/list-deliveries';
import { replayWebhookDelivery } from './controllers/replay-delivery';
import { listWebhookEvents } from './controllers/list-events';

/** Express router for the webhooks admin surface. */
export const router = Router();

router.use(getAuth, isAuth);

router.get('/subscriptions', requirePermission('webhooks.any.read'), listWebhookSubscriptions);
router.post('/subscriptions', requirePermission('webhooks.any.create'), createWebhookSubscription);
router.patch(
    '/subscriptions/:id',
    requirePermission('webhooks.any.update'),
    updateWebhookSubscription
);
router.delete(
    '/subscriptions/:id',
    requirePermission('webhooks.any.delete'),
    deleteWebhookSubscription
);

router.get('/deliveries', requirePermission('webhooks.any.read'), listWebhookDeliveries);
router.post(
    '/deliveries/:id/replay',
    requirePermission('webhooks.any.update'),
    replayWebhookDelivery
);

router.get('/events', requirePermission('webhooks.any.read'), listWebhookEvents);
