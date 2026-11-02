/**
 * @module
 * The notifications inbox: one row per message per user, kept until its owner deletes it, the
 * per-user cap pushes it out, or the account goes. Written by domain events — `cart` and
 * `wishlist` announce whose lists lost a deleted product, and a refused guest-cart merge
 * announces its lines, and a late preorder announces what its buyer was told — never by an import
 * in the other direction: nothing imports this module to send a message, which keeps the graph
 * acyclic and the producers ignorant of the inbox. Depends on the producers only for the event
 * names it subscribes to.
 *
 * It also carries work notices for staff (`audience: staff`): `./staff-routing` says who hears
 * what, `access` and `users` say who that is today.
 *
 * See: docs/modules/notifications.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { OUTBOX_EVENT_DEAD } from '@kernel/outbox';
import { CART_LINES_REMOVED, CART_MERGE_REFUSED } from '@modules/cart';
import {
    FULFILLMENT_ORDER_DELAYED,
    FULFILLMENT_ORDER_HOLD_NOTICED,
    SHIPMENT_LOST
} from '@modules/delivery';
import { ORDER_PURCHASE_HOLD_PLACED } from '@modules/orders';
import { RETURN_REQUESTED } from '@modules/returns';
import { TASK_ASSIGNED, TASK_OPENED, TASK_OVERDUE } from '@modules/tasks';
import { WEBHOOK_SUBSCRIPTION_AUTO_DISABLED } from '@modules/webhooks';
import { WISHLIST_ITEMS_REMOVED } from '@modules/wishlist';
import { STOCK_ALERT_SENT } from '@modules/stock-alerts';
import { notificationsConfig } from './config';
import { notificationsJobs } from './jobs';
import { router } from './routes';
import { notificationsService } from './services';

/** This module's manifest entry: routes, event subscriptions, config, and locales. */
export default {
    name: 'notifications',
    mounts: [{ basePath: '/notifications', routes: router }],
    config: [notificationsConfig.slice],
    jobs: notificationsJobs,
    personalData: [
        {
            section: 'notifications',
            collect: (subject) =>
                notificationsService.list(subject.userId).then((view) => view.items),
            // Joins the caller's own hard-delete transaction — see `notificationsService.removeByUserId`.
            erase: ({ userId }, session) => notificationsService.removeByUserId(userId, session)
        },
        {
            section: 'staffNotifications',
            // Erased with the first section: both are the same rows.
            collect: (subject) => notificationsService.listStaffNotices(subject.userId)
        }
    ],
    subscribe: () => {
        onDomainEvent(CART_LINES_REMOVED, notificationsService.onCartLinesRemoved);
        onDomainEvent(WISHLIST_ITEMS_REMOVED, notificationsService.onWishlistItemsRemoved);
        onDomainEvent(CART_MERGE_REFUSED, notificationsService.onCartMergeRefused);
        onDomainEvent(FULFILLMENT_ORDER_DELAYED, notificationsService.onFulfillmentOrderDelayed);
        onDomainEvent(STOCK_ALERT_SENT, notificationsService.onStockAlertSent);
        onDomainEvent(
            FULFILLMENT_ORDER_HOLD_NOTICED,
            notificationsService.onFulfillmentOrderHoldNoticed
        );
        onDomainEvent(SHIPMENT_LOST, notificationsService.onShipmentLost);
        onDomainEvent(ORDER_PURCHASE_HOLD_PLACED, notificationsService.onPurchaseHoldPlaced);
        onDomainEvent(
            WEBHOOK_SUBSCRIPTION_AUTO_DISABLED,
            notificationsService.onWebhookSubscriptionAutoDisabled
        );
        onDomainEvent(RETURN_REQUESTED, notificationsService.onReturnRequested);
        onDomainEvent(OUTBOX_EVENT_DEAD, notificationsService.onOutboxEventDead);
        onDomainEvent(TASK_OPENED, notificationsService.onTaskOpened);
        onDomainEvent(TASK_OVERDUE, notificationsService.onTaskOverdue);
        onDomainEvent(TASK_ASSIGNED, notificationsService.onTaskAssigned);
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
