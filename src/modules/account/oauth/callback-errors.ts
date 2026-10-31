/**
 * @module
 * The closed set of codes the OAuth callback puts in the frontend redirect's `?error=` query.
 *
 * Twin of `x-redirect-query` on `GET /account/oauth/{provider}/callback` in this module's
 * `openapi.yaml`; `src/modules/account/tests/unit/oauth-callback-errors.test.ts` holds the two equal. It is not a
 * generated type because the bundler inlines a schema declared under an `x-` key and prunes it.
 */

/** Every code `failToFrontend` may send, in the contract's order. */
export const OAUTH_CALLBACK_ERRORS = [
    'access_denied',
    'provider_error',
    'already_linked',
    'link_expired',
    'email_unverified',
    'account_exists',
    'account_unverified'
] as const;

/** One of {@link OAUTH_CALLBACK_ERRORS}: what the frontend's callback page reads from `?error=`. */
export type OAuthCallbackError = (typeof OAUTH_CALLBACK_ERRORS)[number];
