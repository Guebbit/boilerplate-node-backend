/**
 * @module
 * The analytics vocabulary this module emits, pinned string by string: the constant's name is
 * refactored freely, but the string is what Umami keys its series on.
 */

import type { AnalyticsEventMap } from '@infrastructure/observability/analytics';
import { exampleAnalyticsEvents } from '../../analytics';

describe('the example analytics vocabulary', () => {
    it('spells every event exactly as the dashboards expect', () => {
        expect(exampleAnalyticsEvents).toEqual({ EXAMPLE_PUBLISHED: 'example_published' });
    });

    // The `declare module` augmentation is what puts these into the app-wide union; checked at
    // type-check time, since dropping it still compiles on its own.
    it('registers its events in the app-wide union', () => {
        const event: AnalyticsEventMap['example'] = exampleAnalyticsEvents.EXAMPLE_PUBLISHED;

        expect(event).toBe('example_published');
    });
});
