/**
 * @module
 * The analytics event names this module emits, declared by augmenting the analytics port's name
 * map — as `./audit.ts` does for audit actions — so controllers import this file directly rather
 * than a published copy. Naming rule: docs/tools/analytics.md#naming.
 */

/**
 * The pair is the funnel's last gate: succeeded over (succeeded + declined) is the conversion
 * number a payment provider change would move. `PAYMENT_RECORDED_OFFLINE` is a separate event
 * rather than a `PAYMENT_SUCCEEDED` with a flag: it never went through the provider funnel at all,
 * and folding it in would inflate the card conversion number with money that funnel had no part in.
 */
export const paymentsAnalyticsEvents = {
    PAYMENT_SUCCEEDED: 'payment_succeeded',
    PAYMENT_DECLINED: 'payment_declined',
    PAYMENT_RECORDED_OFFLINE: 'payment_recorded_offline'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        payments: (typeof paymentsAnalyticsEvents)[keyof typeof paymentsAnalyticsEvents];
    }
}
