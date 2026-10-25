/**
 * @module
 * The analytics event names this module emits: the admin-facing half of account creation,
 * distinct from `account`'s self-signup `USER_SIGNED_UP`. Both are sent as the acting admin,
 * never as the subject: an event about another person belongs to the actor. Declared by
 * augmenting the analytics port's name map, as `./audit.ts` does for audit actions.
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
