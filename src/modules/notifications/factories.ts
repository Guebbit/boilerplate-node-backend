/**
 * @module
 * In any module: how a row is built for a test or a seed. Reachable at
 * `@modules/notifications/factories` and never from the barrel — it writes past the cap and the
 * live push a service enforces.
 */

import { Types } from 'mongoose';
import type { NotificationBody, NotificationDocument } from './model';

/** What a caller may vary when building a notification; everything else takes a default. */
export interface NotificationOverrides {
    /** 24-char hex of the owning user. */
    userId: string;
    /**
     * The code and its params together, so a row never pairs one code with another's params.
     * Defaults to the cart-line message for one product with an English title.
     */
    body?: NotificationBody;
    /** Defaults to `warning`. */
    severity?: NotificationDocument['severity'];
    /** Stamped read; leave out for unread. */
    readAt?: Date;
    /** Pins the age, so a test can order rows without waiting between inserts. */
    createdAt?: Date;
}

/**
 * Build a notification ready for `notificationRepository.create`.
 * @param overrides - the owner, plus anything else the case cares about
 */
export const makeNotification = (
    overrides: NotificationOverrides
): Partial<NotificationDocument> => ({
    userId: new Types.ObjectId(overrides.userId),
    ...(overrides.body ?? {
        code: 'notifications.cart-line-removed',
        params: { productId: '64b7f1a2c3d4e5f607182930', titles: { en: 'Blue mug' } }
    }),
    severity: overrides.severity ?? 'warning',
    ...(overrides.readAt === undefined ? {} : { readAt: overrides.readAt }),
    ...(overrides.createdAt === undefined ? {} : { createdAt: overrides.createdAt })
});
