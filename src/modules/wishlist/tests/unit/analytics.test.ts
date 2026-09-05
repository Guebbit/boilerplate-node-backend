/**
 * @module
 * The analytics vocabulary this module emits (`src/modules/wishlist/analytics.ts`), pinned
 * string by string: the constant's NAME is refactored freely, but the STRING is what Umami keys
 * its series on — rename it silently and a dashboard's series just stops
 * (`docs/tools/analytics.md#renaming-is-not-free`). No mocks, no database; a static map needs
 * neither.
 */

import type { AnalyticsEventMap } from '@infrastructure/observability/analytics';
import { wishlistAnalyticsEvents } from '../../analytics';

describe('the wishlist analytics vocabulary', () => {
    it('spells every event exactly as the dashboards expect', () => {
        expect(wishlistAnalyticsEvents).toEqual({
            WISHLIST_ITEM_ADDED: 'wishlist_item_added',
            WISHLIST_ITEM_REMOVED: 'wishlist_item_removed',
            WISHLIST_MOVED_TO_CART: 'wishlist_moved_to_cart'
        });
    });

    /*
     * The `declare module` augmentation in `analytics.ts` is what puts these into
     * `AnalyticsEventMap`. Drop it and the module still compiles on its own — but
     * `emitAnalyticsEvent` then rejects every event this module fires, at the call sites rather
     * than here. Checked at type-check time, the same way orders' audit test checks its own union.
     */
    it('registers its events in the app-wide union', () => {
        const event: AnalyticsEventMap['wishlist'] = wishlistAnalyticsEvents.WISHLIST_MOVED_TO_CART;

        expect(event).toBe('wishlist_moved_to_cart');
    });
});
