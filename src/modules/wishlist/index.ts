/**
 * @module
 * Wishlist — public barrel; the only surface a sibling may import (see
 * `docs/theory/strategic-ddd.md` §5 for the rule).
 *
 * See: docs/modules/wishlist.md
 */

export * from './service';

/** A fixture wishlist row for a sibling's own tests. */
export { makeWishlist } from './factories';
export type { WishlistOverrides, WishlistFixture } from './factories';

export type * from './model';
