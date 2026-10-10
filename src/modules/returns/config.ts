/**
 * @module
 * `returns`' retention window for free text. Read per call, the pattern `orders/config.ts` sets,
 * so a test can vary it per case.
 *
 * See: docs/modules/returns.md#configuration
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** How long a return's free text outlives its last change. */
export const returnsConfig = defineConfig({
    name: 'returns',
    shape: {
        NODE_RETURN_TEXT_RETENTION_DAYS: int({ default: 1095, min: 1 })
    }
});

/**
 * Days a return may go unchanged before `reap:returns` unsets its `note` and `declineReason`.
 * See docs/theory/data-retention.md#free-text-on-returns
 * @returns the retention, in days
 */
export const returnTextRetentionDays = (): number =>
    returnsConfig().NODE_RETURN_TEXT_RETENTION_DAYS;
