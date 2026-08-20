/**
 * Account — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * One line wide, which is the whole story of how this module is used. The token surface — the
 * three files in `session/` — is not published: `kernel/authentication.ts` is the port every
 * request goes through, this module fills it from `module.ts` using its own relative imports, and
 * no sibling needs a token. Issuing this application's tokens is what `account` IS, and none of it
 * is anyone else's business. That is also why `session/` is a folder and not a published layer:
 * nothing outside these four walls may import it, so it needs no barrel of its own.
 *
 * What remains is the address book's one cross-module surface: checkout resolves the address an
 * order ships to. The CRUD stays internal — it is served by this module's own routes.
 */

export { addressForCheckout } from './services/addresses';
export type { AddressItem } from './model';
