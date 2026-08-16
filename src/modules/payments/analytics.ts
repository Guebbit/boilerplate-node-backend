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
 * `npm run contracts:bundle` publishes every module's names as
 * `src/infrastructure/observability/analytics-events.ts`, which is byte-identical with the
 * paired frontend's copy. That file is an ARTEFACT — nothing here imports it.
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
