/**
 * @module
 * The analytics event names this module emits.
 *
 * The administrative half of "an account came into existence": `account`'s `USER_SIGNED_UP` is
 * self-signup, these two are an operator acting on somebody else's record, and the month's
 * account total sums both — which is why neither module can carry both names. Declared by
 * augmenting the analytics port's name map, as `./audit.ts` does for audit actions.
 *
 * Naming rule: docs/tools/analytics.md#naming.
 */

/** The event names this module fires, keyed by intent. */
export const usersAnalyticsEvents = {
    // Administrative account lifecycle
    USER_CREATED: 'user_created',
    // Deactivation is a product event as well as an administrative one: it is what a churn
    // dashboard counts, and it is invisible in a plain "updated" signal.
    USER_DEACTIVATED: 'user_deactivated'
} as const;

/** Registers this module's event names into the analytics port's app-wide union. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        users: (typeof usersAnalyticsEvents)[keyof typeof usersAnalyticsEvents];
    }
}
