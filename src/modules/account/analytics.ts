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
 * `npm run contracts:bundle` publishes every module's names as
 * `src/infrastructure/observability/analytics-events.ts`, which is byte-identical with the
 * paired frontend's copy. That file is an ARTEFACT — nothing here imports it.
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
