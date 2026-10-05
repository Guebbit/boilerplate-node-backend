/**
 * @module
 * Notification factories that touch the test database. The BUILDER lives one level up in
 * `../factories.ts`; this file only persists what it returns.
 */

import { notificationRepository } from '../repository';
import type { NotificationDocument } from '../model';
import { makeNotification, type NotificationOverrides } from '../factories';

export { makeNotification, type NotificationOverrides } from '../factories';

/**
 * Persist a notification owned by `overrides.userId`, past the cap and the live push.
 * @param overrides - the owner, plus whatever the case cares about
 */
export const createNotification = (
    overrides: NotificationOverrides
): Promise<NotificationDocument> => notificationRepository.create(makeNotification(overrides));
