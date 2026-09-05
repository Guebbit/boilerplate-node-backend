/**
 * @module
 * The OAuth provider port — the seam a real identity provider plugs into, same shape as
 * `payments/providers/index.ts`'s `PaymentProvider`. Unlike payments, more than one implementation
 * may be enabled at once: a deployment can offer Google AND GitHub together, so selection lives in
 * `./index`'s registry rather than a single `NODE_*_PROVIDER` switch.
 */

/**
 * What a successful token exchange tells this app about the caller. `providerId`, never `email`,
 * is the identity key `../link.ts` stores — see its own doc for why.
 */
export interface OAuthIdentity {
    /** The provider's stable subject ("sub") for this identity. */
    providerId: string;
    /** The provider's claimed address for this identity. */
    email: string;
    /**
     * The provider's OWN claim that `email` is verified. `../link.ts` refuses to link an
     * unverified one to an existing password account — see its security note.
     */
    emailVerified: boolean;
    /** Display name, if the provider returned one. */
    name?: string;
    /** Avatar URL, if the provider returned one. */
    imageUrl?: string;
}

/** One OAuth/OIDC identity provider this app can start a login against. */
export interface OAuthProvider {
    /** Persisted on `OAuthAccount.provider` and returned by `enabledProviders()`. */
    name: string;

    /**
     * The URL to send the browser to for consent.
     *
     * @param state - the CSRF token `./state.ts` minted for this attempt
     * @param redirectUri - where the provider must send the browser back — always
     *   server-derived (`../config.ts`), never taken from the request
     */
    authorizeUrl(state: string, redirectUri: string): string;

    /**
     * Exchange an authorization code for the identity it names.
     *
     * @param code - the `code` query param the provider's callback redirect carried
     * @param redirectUri - the SAME value passed to {@link authorizeUrl} — some providers
     *   validate the two match
     * @throws when the exchange fails or the provider's answer cannot be parsed
     */
    exchangeCode(code: string, redirectUri: string): Promise<OAuthIdentity>;
}
