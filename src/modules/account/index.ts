/**
 * Account — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * Nothing outside this module imports it today: `kernel/authentication.ts` is what
 * `kernel/middlewares/authorizations.ts` reaches for on every request, and `token-cleanup.ts`
 * moved inside the module alongside the controllers that call it. The barrel stays because it is
 * the surface a sibling would have to use, and because narrowing it later is a change to how the
 * app authenticates rather than a tidy-up.
 *
 * The token surface is exported and the auth service is not, which looks backwards until you see
 * who calls what: authorization has to verify a token it was handed on every request, while
 * signing up and logging in happen behind this module's own routes.
 *
 * `jwt.ts` and `cookies.ts` live here rather than in a middleware folder: issuing this
 * application's tokens is what `account` IS. They need no barrel of their own, because a module
 * has exactly one front door and this is it.
 */

export {
    ERefreshTokenExpiryTime,
    getExpiryTime,
    getExpiryTimeMilliseconds,
    getAccessTokenSecret,
    getRefreshTokenSecret,
    getAccessTokenTTL
} from './tokens';

export {
    type ITokenData,
    verifyAccessToken,
    verifyRefreshToken,
    createRefreshToken,
    createAccessToken
} from './jwt';

export {
    createRefreshCookie,
    destroyRefreshCookie,
    createLoggedCookie,
    destroyLoggedCookie
} from './cookies';

/*
 * The address book's one cross-module surface: checkout resolves the address an order ships to.
 * The CRUD stays internal — it is served by this module's own routes.
 */
export { addressForCheckout } from './addresses-service';
export type { IAddressItem } from './addresses-model';
