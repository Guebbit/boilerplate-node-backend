/**
 * @module
 * Wishlist — public barrel; the only surface a sibling may import (see
 * `modules/products/index.ts` for the rule). One export: `wishlistService`, so a caller reads the
 * whole curated surface rather than reaching for one function today and a different one tomorrow.
 *
 * See: docs/modules/wishlist.md
 */

export { wishlistService } from './service';
