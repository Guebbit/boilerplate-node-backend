/**
 * @module
 * The inbox: writing notifications, reading them, and the three ways they leave — the owner
 * deleting one, the owner emptying the inbox, and the cap pushing the oldest out. Every change is
 * pushed to the owner's open streams, so a second tab stays in step with the first.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { NOTIFICATIONS_CHANNELS } from '@types';
import { notificationsConfig } from '../config';
import { presentNotification, presentNotifications, type NotificationsView } from '../presenter';
import { notificationRepository, type NewNotification } from '../repository';
import { publishToUser } from './stream';

/** The caller's whole inbox, newest first. Empty and absent are the same state. */
export const notificationsList = (userId: string): Promise<NotificationsView> =>
    notificationRepository.listByUserId(userId).then(presentNotifications);

/**
 * Enforce the cap for one user: delete everything past their newest N and tell their open tabs.
 * Runs after the insert, so a burst of messages ends at N, never above it for longer than this.
 */
const trimInbox = (userId: string): Promise<void> =>
    notificationRepository
        .trimToNewest(userId, notificationsConfig().NODE_NOTIFICATIONS_MAX_PER_USER)
        .then((ids) => {
            if (ids.length > 0)
                publishToUser(userId, NOTIFICATIONS_CHANNELS.DELETED, { all: false, ids });
        });

/**
 * Write notifications, then push each to its owner and trim each owner to the cap.
 *
 * Owners are trimmed one after another, not in parallel: a bulk product delete can name thousands
 * of users, and one query each is already the cost of the cap.
 *
 * @param rows - what to write; several rows for one user are fine
 */
export const notificationsCreate = async (rows: NewNotification[]): Promise<void> => {
    if (rows.length === 0) return;

    const created = await notificationRepository.insertMany(rows);
    for (const notification of created)
        publishToUser(String(notification.userId), NOTIFICATIONS_CHANNELS.CREATED, {
            notification: presentNotification(notification)
        });

    for (const userId of new Set(created.map((notification) => String(notification.userId))))
        await trimInbox(userId);
};

/**
 * Delete one of the caller's notifications. 404 whether the id is unknown or someone else's, so a
 * probe cannot tell the two apart.
 */
export const notificationDelete = (
    userId: string,
    id: string
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    notificationRepository.deleteOwned(userId, id).then((deleted) => {
        if (!deleted) return generateReject(404, [t('notifications.not-found')]);

        publishToUser(userId, NOTIFICATIONS_CHANNELS.DELETED, { all: false, ids: [id] });
        return generateSuccess(undefined, 200, t('notifications.deleted'));
    });

/** Empty the caller's inbox. Emptying an empty one is the state they asked for, so it succeeds. */
export const notificationsDismissAll = (userId: string): Promise<ResponseSuccess<undefined>> =>
    notificationRepository.deleteAllOwned(userId).then(() => {
        publishToUser(userId, NOTIFICATIONS_CHANNELS.DELETED, { all: true, ids: [] });
        return generateSuccess(undefined, 200, t('notifications.dismissed-all'));
    });

/** Mark every unread notification of the caller read, as of now. */
export const notificationsReadAll = (userId: string): Promise<ResponseSuccess<undefined>> => {
    const readAt = new Date();
    return notificationRepository.markAllRead(userId, readAt).then(() => {
        publishToUser(userId, NOTIFICATIONS_CHANNELS.READ, { readAt: readAt.toISOString() });
        return generateSuccess(undefined, 200, t('notifications.read-all'));
    });
};

/**
 * What a hard account deletion owes the inbox — the `personalData.erase` hook, run inside the
 * caller's own hard-delete transaction, so a throw here aborts that transaction.
 *
 * @param session - joins the delete to that transaction
 */
export const notificationsDeleteByUserId = (
    userId: string,
    session: ClientSession
): Promise<void> => notificationRepository.deleteByUserId(userId, session);
