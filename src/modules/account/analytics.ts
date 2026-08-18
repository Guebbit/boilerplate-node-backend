/**
 * The analytics event names this module emits.
 *
 * Signup and login are the funnel's entrance, so the two counts every other rate is measured
 * against are declared here — with the endpoints that report them.
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

export const accountAnalyticsEvents = {
    // Auth / onboarding
    USER_SIGNED_UP: 'user_signed_up',
    USER_LOGGED_IN: 'user_logged_in',
    USER_PROFILE_VIEWED: 'user_profile_viewed',
    ACCOUNT_DELETED: 'account_deleted'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        account: (typeof accountAnalyticsEvents)[keyof typeof accountAnalyticsEvents];
    }
}
