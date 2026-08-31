/**
 * @module
 * The analytics event names this module emits.
 *
 * Signup and login are the funnel's entrance, so the two counts every other rate is measured
 * against live here, declared by augmenting the analytics port's name map — as `./audit.ts` does
 * for audit actions — so the catalogue grows with the modules that own their names.
 *
 * Naming rule: docs/tools/analytics.md#naming. These names stay here; only
 * `shared/contracts/analytics.frontend.ts` is published to the frontend, keeping an event from
 * being counted twice.
 */

/** The event names this module fires, keyed by what happened. */
export const accountAnalyticsEvents = {
    // Auth / onboarding
    USER_SIGNED_UP: 'user_signed_up',
    USER_LOGGED_IN: 'user_logged_in',
    USER_PROFILE_VIEWED: 'user_profile_viewed',
    ACCOUNT_DELETED: 'account_deleted'
} as const;

/** Augments the analytics port's event-name map with this module's own names. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        account: (typeof accountAnalyticsEvents)[keyof typeof accountAnalyticsEvents];
    }
}
