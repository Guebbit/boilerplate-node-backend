/**
 * @module
 * The inbox: writing notifications, reading them, and the three ways they leave — the owner
 * deleting one, the owner emptying the inbox, and the cap pushing the oldest out. Every change is
 * pushed to the owner's open streams, so a second tab stays in step with the first.
 */

import type { ClientSession } from 'mongoose';
import type { Caller, StaffNoticeExport } from '@types';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { NOTIFICATIONS_CHANNELS, type Notification } from '@types';
import { notificationsConfig } from '../config';
import { presentNotification, presentNotifications, type NotificationsView } from '../presenter';
import {
    notificationRepository,
    type NewNotification,
    type NewStaffNotification
} from '../repository';
import type { NotificationDocument } from '../model';
import { callerHoldsAnySet } from '../staff-routing';
import { publishToUser } from './stream';

/** A user's own messages, newest first: what the data export and the tests read. */
export const notificationsList = (userId: string): Promise<NotificationsView> =>
    notificationRepository.listOwn(userId).then(presentNotifications);

/**
 * The work notices an account was sent, as the data export shows them: which kind and when, never
 * the facts in `params`, which name other people's accounts and orders.
 */
export const notificationsListStaffNotices = (userId: string): Promise<StaffNoticeExport[]> =>
    notificationRepository.listStaff(userId).then((rows) =>
        rows.map((row) => ({
            code: row.code,
            createdAt: row.createdAt.toISOString(),
            ...(row.readAt ? { readAt: row.readAt.toISOString() } : {})
        }))
    );

/**
 * Whether a row may be shown to a caller now. A person's own message always; a work notice only to
 * a member of the shop who still holds one of the permission sets that earned it, so a role taken
 * away takes the notices with it without a write.
 */
const visibleTo = (row: NotificationDocument, caller: Caller): boolean =>
    row.audience === 'own' ||
    (caller.scope === 'tenant' &&
        row.tenantId === caller.tenantId &&
        callerHoldsAnySet(caller, row.sets ?? []));

/**
 * The caller's inbox, newest first: their own messages plus the work notices of their shop that
 * they currently hold the sets for. Empty and absent are the same state.
 *
 * @param caller - the reader in tenant scope (`request.caller`); `id` must be set
 */
export const notificationsListVisible = (caller: Caller): Promise<NotificationsView> =>
    Promise.all([
        notificationRepository.listOwn(String(caller.id)),
        caller.scope === 'tenant'
            ? notificationRepository.listStaff(String(caller.id), caller.tenantId)
            : Promise.resolve([])
    ]).then(([own, staff]) =>
        presentNotifications(
            [...own, ...staff]
                .filter((row) => visibleTo(row, caller))
                .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        )
    );

/**
 * One of the caller's notifications. 404 whether the id is unknown, someone else's, or a work
 * notice the caller no longer holds the sets for, so a probe cannot tell them apart.
 */
export const notificationGet = (
    caller: Caller,
    id: string
): Promise<ResponseSuccess<Notification> | ResponseReject> =>
    notificationRepository
        .findOwned(String(caller.id), id)
        .then((row) =>
            row && visibleTo(row, caller)
                ? generateSuccess(presentNotification(row))
                : generateReject(404, [t('notifications.not-found')])
        );

/**
 * Enforce one audience's cap for one user: delete everything past their newest N and tell their
 * open tabs. Runs after the insert, so a burst of messages ends at N, never above it for longer
 * than this.
 */
const trimInbox = (userId: string, audience: NotificationDocument['audience']): Promise<void> =>
    notificationRepository
        .trimToNewest(
            userId,
            audience === 'staff'
                ? notificationsConfig().NODE_NOTIFICATIONS_STAFF_MAX_PER_USER
                : notificationsConfig().NODE_NOTIFICATIONS_MAX_PER_USER,
            audience
        )
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
        await trimInbox(userId, 'own');
};

/**
 * Write a work notice for one recipient unless they already have it, then push it and trim their
 * work notices to the staff cap. A repeat (a redelivered event) changes nothing and says so.
 *
 * @param row - the notice, with its dedupe key and expiry
 * @returns whether this call wrote it, so the caller mails only the first time
 */
export const notificationsCreateStaffOnce = (row: NewStaffNotification): Promise<boolean> =>
    notificationRepository.insertStaffOnce(row).then(async (created) => {
        if (!created) return false;

        publishToUser(String(created.userId), NOTIFICATIONS_CHANNELS.CREATED, {
            notification: presentNotification(created)
        });
        await trimInbox(String(created.userId), 'staff');
        return true;
    });

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
        return generateSuccess(undefined, 200);
    });

/** Empty the caller's inbox. Emptying an empty one is the state they asked for, so it succeeds. */
export const notificationsDismissAll = (userId: string): Promise<ResponseSuccess<undefined>> =>
    notificationRepository.deleteByUserId(userId).then(() => {
        publishToUser(userId, NOTIFICATIONS_CHANNELS.DELETED, { all: true, ids: [] });
        return generateSuccess(undefined, 200);
    });

/** Mark every unread notification of the caller read, as of now. */
export const notificationsReadAll = (userId: string): Promise<ResponseSuccess<undefined>> => {
    const readAt = new Date();
    return notificationRepository.markAllRead(userId, readAt).then(() => {
        publishToUser(userId, NOTIFICATIONS_CHANNELS.READ, { readAt: readAt.toISOString() });
        return generateSuccess(undefined, 200);
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
