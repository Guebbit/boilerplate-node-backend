/**
 * @module
 * `delivery`'s retention window for the one piece of free text it holds: staff's note on a hold.
 * Read per call, the pattern `returns/config.ts` sets, so a test can vary it per case.
 *
 * See: docs/modules/delivery.md#configuration
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** How long a hold note outlives its fulfillment order's last change. */
export const deliveryConfig = defineConfig({
    name: 'delivery',
    shape: {
        NODE_HOLD_NOTE_RETENTION_DAYS: int({ default: 365, min: 1 })
    }
});

/**
 * Days a fulfillment order may go unchanged before `reap:delivery` unsets its `holdNote`.
 * See docs/theory/data-retention.md#free-text-on-holds
 * @returns the retention, in days
 */
export const holdNoteRetentionDays = (): number => deliveryConfig().NODE_HOLD_NOTE_RETENTION_DAYS;
