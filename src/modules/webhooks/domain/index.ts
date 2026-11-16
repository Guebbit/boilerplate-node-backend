/**
 * @module
 * This module's pure rules. Re-exported flat rather than as namespaces: two files, no risk of a
 * name collision growing one.
 *
 * @see docs/understand/domain-layer.md#where-does-this-go
 */

export {
    WEBHOOK_RETRY_DELAYS_MS,
    WEBHOOK_MAX_ATTEMPTS,
    WEBHOOK_MAX_CONSECUTIVE_FAILURES,
    WEBHOOK_MIN_FAILING_MS,
    nextRetryDelayMs,
    nextAttemptAt,
    shouldAutoDisable
} from './backoff';
export { matchesEventFilter, ALL_EVENTS } from './event-filter';
