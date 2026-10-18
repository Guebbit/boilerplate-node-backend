/**
 * @module
 * Notifications service — the inbox and its live stream, and the door every controller and
 * sibling module goes through. `inbox.ts` writes and reads, `stream.ts` delivers, `subscribers.ts`
 * maps domain events onto rows.
 */

import * as inbox from './inbox';
import {
    onCartLinesRemoved,
    onWishlistItemsRemoved,
    onCartMergeRefused,
    onFulfillmentOrderDelayed,
    onStockAlertSent,
    onFulfillmentOrderHoldNoticed
} from './subscribers';
import { streamNotifications, publishToUser, openStreamCount } from './stream';

/** The service's public surface — controllers and siblings call through this, never the bare functions. */
export const notificationsService = {
    list: inbox.notificationsList,
    create: inbox.notificationsCreate,
    remove: inbox.notificationDelete,
    dismissAll: inbox.notificationsDismissAll,
    readAll: inbox.notificationsReadAll,
    removeByUserId: inbox.notificationsDeleteByUserId,
    stream: streamNotifications,
    publishToUser,
    openStreamCount,
    onCartLinesRemoved,
    onWishlistItemsRemoved,
    onCartMergeRefused,
    onFulfillmentOrderDelayed,
    onStockAlertSent,
    onFulfillmentOrderHoldNoticed
};
