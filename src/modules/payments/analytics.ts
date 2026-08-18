/**
 * The analytics event names this module emits.
 *
 * The funnel's last gate: succeeded over (succeeded + declined) is the conversion number a payment
 * provider change would move.
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

export const paymentsAnalyticsEvents = {
    // Payments
    // The pair is the funnel's last gate: succeeded over (succeeded + declined) is the
    // conversion number a payment provider change would move.
    PAYMENT_SUCCEEDED: 'payment_succeeded',
    PAYMENT_DECLINED: 'payment_declined'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        payments: (typeof paymentsAnalyticsEvents)[keyof typeof paymentsAnalyticsEvents];
    }
}
