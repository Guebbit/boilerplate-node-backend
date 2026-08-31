/**
 * @module
 * The analytics event names this module emits. Signup and login anchor the funnel other rates
 * are measured against, declared by augmenting the analytics port's name map (as `./audit.ts`
 * does for audit actions) so the catalogue grows with the modules that own their names. Naming
 * rule: docs/tools/analytics.md#naming — these names stay here only, since the paired frontend
 * emits no custom events of its own and every name keeps exactly one emitter.
 */

/** The event names this module fires, keyed by what happened. */
export const accountAnalyticsEvents = {
    // Auth / onboarding
    USER_SIGNED_UP: 'user_signed_up',
    USER_LOGGED_IN: 'user_logged_in',
    // Emitted server-side, not by the client: both logout routes are real requests this API
    // answers, so it can report the one that succeeded rather than the one that was attempted.
    USER_LOGGED_OUT: 'user_logged_out',
    USER_PROFILE_VIEWED: 'user_profile_viewed',
    ACCOUNT_DELETED: 'account_deleted'
} as const;

/** Augments the analytics port's event-name map with this module's own names. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        account: (typeof accountAnalyticsEvents)[keyof typeof accountAnalyticsEvents];
    }
}
