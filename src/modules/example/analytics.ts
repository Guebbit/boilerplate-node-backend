/**
 * @module
 * In any module: the analytics event names it fires, declared by augmenting the analytics port's
 * name map, so the app-wide union grows with the modules that are enabled.
 * Here: one event, `example_published`, fired when a publish lands.
 * Delete it if: the module reports nothing to analytics (and drop the `emitAnalyticsEvent` call).
 *
 * See: docs/tools/analytics.md#naming
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
