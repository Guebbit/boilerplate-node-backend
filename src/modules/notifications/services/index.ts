/**
 * @module
 * Notifications service — the inbox and its live stream, and the door every controller and
 * sibling module goes through. `inbox.ts` writes and reads, `stream.ts` delivers, `subscribers.ts`
 * maps domain events onto rows.
 */

import * as inbox from './inbox';

export {
    notificationsList,
    notificationsCreate,
    notificationDelete,
    notificationsDismissAll,
    notificationsReadAll,
    notificationsDeleteByUserId
} from './inbox';
export { onCartLinesRemoved, onWishlistItemsRemoved, onCartMergeRefused } from './subscribers';
export { streamNotifications, publishToUser, openStreamCount } from './stream';

/** The service's public surface — controllers call through this, never the bare functions. */
export const notificationsService = {
    notificationsList: inbox.notificationsList,
    notificationsCreate: inbox.notificationsCreate,
    notificationDelete: inbox.notificationDelete,
    notificationsDismissAll: inbox.notificationsDismissAll,
    notificationsReadAll: inbox.notificationsReadAll,
    notificationsDeleteByUserId: inbox.notificationsDeleteByUserId
};
