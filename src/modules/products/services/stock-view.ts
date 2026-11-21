/**
 * @module
 * Who sees exact stock. The counters leak sales velocity to a competitor and help plan a
 * denial-of-inventory attack, so they go only to a caller holding `read:StockLevel`, through
 * `GET /inventory/levels/{productId}`. The product answer carries none of them, for anyone.
 * Shopify's Storefront API draws the same line: a quantity only for a merchant who grants the scope.
 */

import type { Caller } from '@types';
import { holds } from '@kernel/ability';

/**
 * Does this caller see exact stock? Asks for the rule `read:StockLevel`, which only a stock
 * reader holds.
 *
 * @param caller - `request.caller`, or `undefined` for an anonymous request
 */
export const canSeeStock = (caller?: Caller): boolean =>
    caller !== undefined && holds(caller, 'read', 'StockLevel');
