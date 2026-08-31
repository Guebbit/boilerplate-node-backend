/**
 * @module
 * The analytics event names this module emits — the funnel's last gate: succeeded over
 * (succeeded + declined) is the conversion number a payment provider change would move.
 *
 * Declared by augmenting the analytics port's name map, as `./audit.ts` does for audit actions,
 * so the catalogue grows with the modules that own their names. These names stay HERE: the
 * controllers that fire them import this file directly, so nothing needs to publish a copy.
 *
 * Naming rule: docs/tools/analytics.md#naming.
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
