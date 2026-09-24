/**
 * @module
 * The no-op analytics provider. Select with `NODE_ANALYTICS_PROVIDER=none` — it exists so
 * "collects nothing" is a stated choice, not a side effect of blank credentials. The other two
 * providers warn when selected but unconfigured, because that state is almost always an
 * accident; this one is silent because it is not.
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
