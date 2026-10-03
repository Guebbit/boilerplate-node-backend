/**
 * @module
 * Optional capability, in its own file: the analytics event names this module fires, declared by
 * augmenting the analytics port's name map. Delete the file and the `emitAnalyticsEvent` call to
 * drop it. Naming rule: docs/tools/analytics.md#naming.
 */

/** The event names this module fires, keyed by intent. */
export const exampleAnalyticsEvents = {
    EXAMPLE_PUBLISHED: 'example_published'
} as const;

/** Registers this module's event names into the analytics port's app-wide union. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        example: (typeof exampleAnalyticsEvents)[keyof typeof exampleAnalyticsEvents];
    }
}
