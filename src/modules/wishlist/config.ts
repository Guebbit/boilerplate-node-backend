/**
 * @module
 * The wishlist's one knob: how many products one list may hold.
 *
 * See: docs/operate/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Wishlist size. */
export const wishlistConfig = defineConfig({
    name: 'wishlist',
    shape: {
        // `max: 250` keeps "never paginated" true whatever an operator sets.
        NODE_WISHLIST_MAX: int({ default: 250, min: 1, max: 250 })
    }
});

/**
 * The most products one wishlist may hold. `GET /wishlist` is never paginated, so this is what keeps
 * it small; 250 is commercetools' own shopping-list limit and under Zalando's "few hundred" (#159).
 * @returns the cap on lines per wishlist, 1 to 250
 */
export const wishlistMax = (): number => wishlistConfig().NODE_WISHLIST_MAX;
