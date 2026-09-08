/**
 * @module
 * Who is making this request — a port the kernel declares and `account` supplies at boot. Two
 * outcomes, and callers depend on the difference: **rejects** (token absent, malformed, expired,
 * wrongly signed) vs. **resolves `undefined`** (token verified, user no longer exists). Collapsing
 * them turns a deleted admin's 403 into a 401: "log in again" for an account that cannot.
 *
 * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
 */

import type { AuthContext } from '@types';

/** Turns a signed token into the user it names. Implemented by `account`. */
export interface AuthResolver {
    fromAccessToken: (token: string) => Promise<AuthContext | undefined>;
    fromRefreshToken: (token: string) => Promise<AuthContext | undefined>;
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
 * @throws {Error} when no module has registered one
 */
const requireResolver = (): AuthResolver => {
    if (!resolver)
        throw new Error(
            'No auth resolver is registered: this build has no module providing authentication.'
        );
    return resolver;
};

/** Resolve an access token, for the `Authorization: Bearer` path. */
export const resolveAccessToken = (token: string): Promise<AuthContext | undefined> =>
    Promise.resolve().then(() => requireResolver().fromAccessToken(token));

/** Resolve a refresh token, for the cookie path. */
export const resolveRefreshToken = (token: string): Promise<AuthContext | undefined> =>
    Promise.resolve().then(() => requireResolver().fromRefreshToken(token));
