/**
 * @module
 * Who sees how much stock. The exact counters (`onHand`, `reserved`, `available`) leak sales
 * velocity to a competitor and help plan a denial-of-inventory attack, so they go only to a caller
 * holding `inventory.any.read`; everyone else gets the two flags, `inStock` and `lowStock`, which
 * every response carries. Shopify's Storefront API draws the same line: a quantity only for a
 * merchant who grants the scope.
 */

import type { Caller, Product } from '@types';
import { heldKeys } from '@kernel/ability';
import { carryVersion } from '@infrastructure/persistence/versioning';

/** The key that unlocks the counters. */
const STOCK_KEY = 'inventory.any.read';

/**
 * Does this caller see exact stock? The literal keys, not CASL's collapsed `can`: only the key
 * itself says so.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const canSeeStock = (caller?: Caller): boolean =>
    caller !== undefined && heldKeys(caller).has(STOCK_KEY);

/**
 * A product as `caller` may see it: the counters stay for a stock reader, and go for everyone
 * else. The flags were computed from them before this runs, so they survive either way.
 *
 * @param product - the wire product, counters included
 * @param seesStock - {@link canSeeStock}, asked once per request rather than once per product
 */
export const redactStock = <T extends Product>(product: T, seesStock: boolean): T => {
    if (seesStock) return product;

    const { onHand: _onHand, reserved: _reserved, available: _available, ...visible } = product;

    // The row's version rides beside the wire object (for the `ETag`), not on it, so the copy the
    // rest-spread made has to be handed it again.
    // `as T`: the rest-spread type drops the three optional fields, which is the point; the
    // result is still every other field `T` declared.
    return carryVersion(product, visible as T);
};
