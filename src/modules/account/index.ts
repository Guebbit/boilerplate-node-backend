/**
 * @module
 * Account — public barrel.
 *
 * The only surface a sibling module may import; see `modules/products/index.ts` for the rule.
 * One line wide: the token surface in `session/` is never published — `kernel/authentication.ts`
 * is the port every request goes through, and no sibling needs a token — so `session/` needs no
 * barrel of its own. What remains is the address book's one cross-module surface: the address a
 * checkout resolves. Its CRUD stays internal, served by this module's own routes.
 *
 * See: docs/modules/account.md
 */

/** The single address a checkout may resolve — see `../cart`'s `customer-supplier` edge. */
export { addressForCheckout } from './services/addresses';

/** The stored address-book entry shape, for the one function above. */
export type { AddressItem } from './model';
