/**
 * @module
 * The one place a notification document becomes the wire shape `openapi.yaml` declares. Built
 * rather than serialized, so a field the contract does not name can never leak through.
 */

import type { Notification } from '@types';
import type { NotificationBody, NotificationDocument } from './model';

/** The inbox as `openapi.yaml` declares it: `NotificationsResponse`. */
export interface NotificationsView {
    items: Notification[];
}

/**
 * The `code` + `params` of a document, re-read as the contract's variant for that code. A switch
 * rather than `{ code, params }` read off the document: destructuring the two separately loses
 * the pairing the union exists to keep, and the compiler would stop checking it.
 */
const bodyOf = (notification: NotificationDocument): NotificationBody => {
    switch (notification.code) {
        case 'notifications.cart-merge-refused': {
            return { code: notification.code, params: notification.params };
        }
        case 'notifications.cart-line-removed':
        case 'notifications.wishlist-item-removed': {
            return { code: notification.code, params: notification.params };
        }
    }
};

/** Turn one notification document into the contract's `Notification`, the variant for its code. */
export const presentNotification = (notification: NotificationDocument): Notification => ({
    id: String(notification._id),
    ...bodyOf(notification),
    severity: notification.severity,
    // Absent while unread, rather than `null`: the stream's payload cannot express null.
    ...(notification.readAt ? { readAt: notification.readAt.toISOString() } : {}),
    createdAt: notification.createdAt.toISOString()
});

/** Turn a user's notification documents into the response the contract declares. */
export const presentNotifications = (notifications: NotificationDocument[]): NotificationsView => ({
    items: notifications.map((notification) => presentNotification(notification))
});
