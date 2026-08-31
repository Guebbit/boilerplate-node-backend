/**
 * @module
 * The no-op analytics provider.
 *
 * Select with `NODE_ANALYTICS_PROVIDER=none`. It exists so that "this deployment collects no
 * product analytics" is a stated choice rather than a side effect of leaving credentials blank —
 * the other two providers warn when they are selected but unconfigured, precisely because that
 * state is almost always an accident. This one is silent because it is not.
 *
 * See: docs/tools/analytics.md
 */

import type { AnalyticsProvider } from './index';

/** Satisfies the port while doing nothing: `capture` is a no-op and `configured` is always true. */
export const noneAnalyticsProvider: AnalyticsProvider = {
    name: 'none',

    capture(): void {
        // Deliberately empty.
    },

    // Collecting nothing is this provider's whole configuration, so it is never unconfigured.
    configured(): boolean {
        return true;
    },

    shutdown(): Promise<void> {
        return Promise.resolve();
    }
};
