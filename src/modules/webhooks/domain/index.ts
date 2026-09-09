/**
 * @module
 * This module's pure rules — see `docs/theory/domain-layer.md` for what earns a place here.
 * Re-exported flat rather than as namespaces: two files, no risk of a name collision growing one.
 */

export {
    WEBHOOK_RETRY_DELAYS_MS,
    WEBHOOK_MAX_ATTEMPTS,
    WEBHOOK_MAX_CONSECUTIVE_FAILURES,
    nextRetryDelayMs,
    nextAttemptAt,
    shouldAutoDisable
} from './backoff';
export { matchesEventFilter, ALL_EVENTS } from './event-filter';
