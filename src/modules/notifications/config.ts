/**
 * @module
 * The inbox's knobs: how many notifications a user keeps, how many work notices (with their
 * lifetime) a staff member keeps beside them, and how long a thing waits before the daily digest
 * counts it.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Notification retention. */
export const notificationsConfig = defineConfig({
    name: 'notifications',
    shape: {
        NODE_NOTIFICATIONS_MAX_PER_USER: int({ default: 100, min: 1 }),
        // Apart from the cap above, so a refund storm cannot push a person's own messages out.
        NODE_NOTIFICATIONS_STAFF_MAX_PER_USER: int({ default: 200, min: 1 }),
        NODE_NOTIFICATIONS_STAFF_TTL_DAYS: int({ default: 30, min: 1 }),
        // The daily digest: how long a thing waits before it is counted for staff.
        NODE_STAFF_TRANSFER_DUE_HOURS: int({ default: 24, min: 1 }),
        NODE_STAFF_HOLD_OPEN_DAYS: int({ default: 3, min: 1 }),
        NODE_STAFF_RETURN_DECISION_DAYS: int({ default: 3, min: 1 }),
        NODE_STAFF_UNSHIPPED_DAYS: int({ default: 3, min: 1 }),
        NODE_STAFF_TRACKING_MISSING_HOURS: int({ default: 24, min: 1 }),
        NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS: int({ default: 14, min: 1 })
    }
});
