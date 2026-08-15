/**
 * The no-op analytics provider.
 *
 * Select with `NODE_ANALYTICS_PROVIDER=none`. It exists so that "this deployment collects no
 * product analytics" is a stated choice rather than a side effect of leaving credentials blank —
 * the other two providers warn when they are selected but unconfigured, precisely because that
 * state is almost always an accident. This one is silent because it is not.
 */

import type { AnalyticsProvider } from './index';

export const noneAnalyticsProvider: AnalyticsProvider = {
    name: 'none',

    capture(): void {
        // Deliberately empty.
    },

    shutdown(): Promise<void> {
        return Promise.resolve();
    }
};
