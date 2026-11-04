/**
 * @module
 * Notifications service — the inbox and its live stream, and the door every controller and
 * sibling module goes through. `inbox.ts` writes and reads, `staff.ts` tells the staff, `stream.ts` delivers, `subscribers.ts`
 * maps domain events onto rows.
 */

import * as inbox from './inbox';
import { notifyStaff, staffRecipients } from './staff';
import {
    onWebhookSubscriptionAutoDisabled,
    onTaskOpened,
    onTaskOverdue,
    onTaskAssigned,
    onOutboxEventDead
} from './subscribers';
import { streamNotifications, publishToUser, openStreamCount } from './stream';

/** The service's public surface — controllers and siblings call through this, never the bare functions. */
export const notificationsService = {
    list: inbox.notificationsList,
    listStaffNotices: inbox.notificationsListStaffNotices,
    listVisible: inbox.notificationsListVisible,
    get: inbox.notificationGet,
    create: inbox.notificationsCreate,
    notifyStaff,
    staffRecipients,
    writeSummary: inbox.notificationsWriteSummary,
    clearSummary: inbox.notificationsClearSummary,
    remove: inbox.notificationDelete,
    dismissAll: inbox.notificationsDismissAll,
    readAll: inbox.notificationsReadAll,
    removeByUserId: inbox.notificationsDeleteByUserId,
    stream: streamNotifications,
    publishToUser,
    openStreamCount,
    onWebhookSubscriptionAutoDisabled,
    onTaskOpened,
    onTaskOverdue,
    onTaskAssigned,
    onOutboxEventDead
};

export type { StaffLink, StaffRoute, StaffNoticeBody } from '../staff-routing';

export type { StaffNotice } from './staff';
