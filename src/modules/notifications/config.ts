/**
 * @module
 * The inbox's one knob: how many notifications a user keeps.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Notification retention. */
export const notificationsConfig = defineConfig({
    name: 'notifications',
    shape: {
        NODE_NOTIFICATIONS_MAX_PER_USER: int({ default: 100, min: 1 })
    }
});
