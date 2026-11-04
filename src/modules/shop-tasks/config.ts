/**
 * @module
 * The shop's staff digest knobs: how long a thing waits before the daily digest counts it.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Digest allowances. */
export const shopTasksConfig = defineConfig({
    name: 'shop-tasks',
    shape: {
        NODE_STAFF_TRANSFER_DUE_HOURS: int({ default: 24, min: 1 }),
        NODE_STAFF_HOLD_OPEN_DAYS: int({ default: 3, min: 1 }),
        NODE_STAFF_RETURN_DECISION_DAYS: int({ default: 3, min: 1 }),
        NODE_STAFF_UNSHIPPED_DAYS: int({ default: 3, min: 1 }),
        NODE_STAFF_TRACKING_MISSING_HOURS: int({ default: 24, min: 1 }),
        NODE_DELIVERY_UNDELIVERED_REMINDER_DAYS: int({ default: 14, min: 1 })
    }
});
