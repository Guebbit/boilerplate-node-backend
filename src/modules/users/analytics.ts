/**
 * The analytics event names this module emits.
 *
 * The administrative half of "an account came into existence". `account`'s `USER_SIGNED_UP` is a
 * person signing themselves up; these two are an operator acting on somebody else's record, and
 * the month's account total is the sum of both — which is why neither module can carry both names.
 *
 * Naming rule: docs/tools/analytics.md#naming.
 *
 * Declared by augmenting the analytics port's name map rather than by editing a shared file,
 * exactly as `./audit.ts` does for audit actions: the catalogue grows with the modules that own
 * their names, and `infrastructure` keeps knowing no domain at all.
 *
 * These names stay HERE. Nothing publishes them: the controllers that fire them import this file
 * directly, so a copy would have no reader on either side of the repo boundary. Only
 * `shared/contracts/analytics.frontend.ts` — the moments this service never observes — is
 * published to the paired frontend, which is what keeps one event from being counted twice.
 */

export const usersAnalyticsEvents = {
    // Administrative account lifecycle
    USER_CREATED: 'user_created',
    // Deactivation is a product event as well as an administrative one: it is what a churn
    // dashboard counts, and it is invisible in a plain "updated" signal.
    USER_DEACTIVATED: 'user_deactivated'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        users: (typeof usersAnalyticsEvents)[keyof typeof usersAnalyticsEvents];
    }
}
