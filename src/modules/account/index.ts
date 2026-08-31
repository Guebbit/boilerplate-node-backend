/**
 * @module
 * Account — public barrel: the only surface a sibling module may import (see
 * `modules/products/index.ts` for the rule). `session/`'s token surface is never published, since
 * every request goes through `kernel/authentication.ts`; what remains is the address book's one
 * cross-module surface, the address a checkout resolves. See docs/modules/account.md.
 */

/** The single address a checkout may resolve — see `../cart`'s `customer-supplier` edge. */
export { addressForCheckout } from './services/addresses';

/** The stored address-book entry shape, for the one function above. */
export type { AddressItem } from './model';
