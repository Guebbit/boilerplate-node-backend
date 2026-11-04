/**
 * @module
 * The inbox's knobs: how many notifications a user keeps, and how many work notices (with their
 * lifetime) a staff member keeps beside them.
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
        NODE_NOTIFICATIONS_STAFF_TTL_DAYS: int({ default: 30, min: 1 })
    }
});
