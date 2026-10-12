/**
 * @module
 * The OAuth provider port — the seam a real identity provider plugs into, same shape as
 * `payments/providers/index.ts`'s `PaymentProvider`. Unlike payments, more than one implementation
 * may be enabled at once: a deployment can offer Google AND GitHub together, so selection lives in
 * `./index`'s registry rather than a single `NODE_*_PROVIDER` switch.
 */

/**
 * What a successful token exchange tells this app about the caller. `providerId`, never `email`,
 * is the identity key `account/services/oauth.ts` stores — see its own doc for why.
 */
export interface OAuthIdentity {
    /** The provider's stable subject ("sub") for this identity. */
    providerId: string;
    /** The provider's claimed address for this identity. */
    email: string;
    /**
     * The provider's OWN claim that `email` is verified. `account/services/oauth.ts` refuses to
     * link an unverified one to an existing password account — see its security note.
     */
    emailVerified: boolean;
    /** Display name, if the provider returned one. */
    name?: string;
    /** Avatar URL, if the provider returned one. */
    imageUrl?: string;
}

/** What the provider's redirect back to `/account/oauth/:provider/callback` carried. */
export interface OAuthCallback {
    /** The authorization `code`. */
    code: string;
    /** The `state` the provider echoed back. */
    state: string;
}

/** What this login attempt kept at the start, and the callback must answer to. */
export interface OAuthExpectation {
    /** The SAME redirect URI the consent URL carried — some providers validate the two match. */
    redirectUri: string;
    /** The CSRF `state` minted for this attempt; the exchange refuses a callback with another. */
    state: string;
    /**
     * The PKCE secret behind the challenge `authorizeUrl` sent; the provider hashes it and refuses
     * the exchange unless it matches.
     */
    codeVerifier: string;
}

/** One OAuth/OIDC identity provider this app can start a login against. */
export interface OAuthProvider {
    /** Persisted on `OAuthAccount.provider` and returned by `enabledProviders()`. */
    name: string;

    /**
     * The URL to send the browser to for consent.
     *
     * @param state - the CSRF token `../state.ts` minted for this attempt
     * @param redirectUri - where the provider must send the browser back — always
     *   server-derived (`../config.ts`), never taken from the request
     * @param codeChallenge - `../state.ts#codeChallengeOf` of this attempt's PKCE verifier; sent
     *   as `code_challenge` with `code_challenge_method=S256` so the code this call produces is
     *   redeemable only by whoever holds the verifier — RFC 7636
     */
    authorizeUrl(state: string, redirectUri: string, codeChallenge: string): string;

    /**
     * Exchange an authorization code for the identity it names.
     *
     * @param callback - what the provider's redirect carried
     * @param expected - what this attempt kept, for the exchange to check the callback against
     * @throws when `state` differs, the exchange fails or the provider's answer cannot be parsed
     */
    exchangeCode(callback: OAuthCallback, expected: OAuthExpectation): Promise<OAuthIdentity>;
}
