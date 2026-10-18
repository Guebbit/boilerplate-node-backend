/**
 * @module
 * The notifications inbox: one row per message per user, kept until its owner deletes it, the
 * per-user cap pushes it out, or the account goes. Written by domain events — `cart` and
 * `wishlist` announce whose lists lost a deleted product, and a refused guest-cart merge
 * announces its lines, and a late preorder announces what its buyer was told — never by an import
 * in the other direction: nothing imports this module to send a message, which keeps the graph
 * acyclic and the producers ignorant of the inbox. Depends on `cart`, `delivery` and `wishlist` only
 * for the event names it subscribes to.
 *
 * See: docs/modules/notifications.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { CART_LINES_REMOVED, CART_MERGE_REFUSED } from '@modules/cart';
import { FULFILLMENT_ORDER_DELAYED, FULFILLMENT_ORDER_HOLD_NOTICED } from '@modules/delivery';
import { WISHLIST_ITEMS_REMOVED } from '@modules/wishlist';
import { notificationsConfig } from './config';
import { router } from './routes';
import { notificationsService } from './services';

/** This module's manifest entry: routes, event subscriptions, config, and locales. */
export default {
    name: 'notifications',
    basePath: '/notifications',
    routes: router,
    config: [notificationsConfig.slice],
    personalData: [
        {
            section: 'notifications',
            collect: (subject) =>
                notificationsService.list(subject.userId).then((view) => view.items),
            // Joins the caller's own hard-delete transaction — see `notificationsService.removeByUserId`.
            erase: notificationsService.removeByUserId
        }
    ],
    subscribe: () => {
        onDomainEvent(CART_LINES_REMOVED, notificationsService.onCartLinesRemoved);
        onDomainEvent(WISHLIST_ITEMS_REMOVED, notificationsService.onWishlistItemsRemoved);
        onDomainEvent(CART_MERGE_REFUSED, notificationsService.onCartMergeRefused);
        onDomainEvent(FULFILLMENT_ORDER_DELAYED, notificationsService.onFulfillmentOrderDelayed);
        onDomainEvent(
            FULFILLMENT_ORDER_HOLD_NOTICED,
            notificationsService.onFulfillmentOrderHoldNoticed
        );
    },
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
