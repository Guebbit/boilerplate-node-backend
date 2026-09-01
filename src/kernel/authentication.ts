/**
 * @module
 * Who is making this request — a port the kernel declares and `account` supplies at boot. Two
 * outcomes, and callers depend on the difference: **rejects** (token absent, malformed, expired,
 * wrongly signed) vs. **resolves `undefined`** (token verified, user no longer exists). Collapsing
 * them turns a deleted admin's 403 into a 401: "log in again" for an account that cannot.
 *
 * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
 */

/** The subset of a user the request context carries. Deliberately not the module's document type. */
export interface AuthenticatedUser {
    id: string;
    email: string;
    username: string;
    admin?: boolean;
    imageUrl?: string;
    /**
     * Epoch seconds this session last actually proved itself — carried from the token's own
     * `auth_time` claim, never derived here. `0` means "unknown/never" (a pre-wave-4 token),
     * which reads as infinitely old — see `TokenData` in `account/session/jwt.ts`.
     * BETTER_SECURITY.md wave 4.
     */
    authTime: number;
    /** How `authTime` was proved — RFC 8176 values, `['pwd']` today. Wave 4, same reasoning. */
    amr: readonly string[];
}

/** Turns a signed token into the user it names. Implemented by `account`. */
export interface AuthResolver {
    fromAccessToken: (token: string) => Promise<AuthenticatedUser | undefined>;
    fromRefreshToken: (token: string) => Promise<AuthenticatedUser | undefined>;
}

/** The currently registered resolver, or `undefined` before `account` boots and installs one. */
let resolver: AuthResolver | undefined;

/**
 * Install the resolver. Called once, at import time, by the module that owns authentication.
 *
 * @param implementation - the module's resolver
 */
export const registerAuthResolver = (implementation: AuthResolver): void => {
    resolver = implementation;
};

/**
 * The registered resolver.
 *
 * Unregistered is a real state, not a misconfiguration: a build with no `account` module has no
 * authentication. Rejecting for the same reason a bad token does means the guards need no branch.
 */
const requireResolver = (): AuthResolver => {
    if (!resolver)
        throw new Error(
            'No auth resolver is registered: this build has no module providing authentication.'
        );
    return resolver;
};

/** Resolve an access token, for the `Authorization: Bearer` path. */
export const resolveAccessToken = (token: string): Promise<AuthenticatedUser | undefined> =>
    Promise.resolve().then(() => requireResolver().fromAccessToken(token));

/** Resolve a refresh token, for the cookie path. */
export const resolveRefreshToken = (token: string): Promise<AuthenticatedUser | undefined> =>
    Promise.resolve().then(() => requireResolver().fromRefreshToken(token));
