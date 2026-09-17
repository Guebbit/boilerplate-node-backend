/**
 * @module
 * Who is making this request — a port the kernel declares and `account` supplies at boot. Two
 * outcomes, and callers depend on the difference: **rejects** (token absent, malformed, expired,
 * wrongly signed) vs. **resolves `undefined`** (token verified, user no longer exists). Collapsing
 * them turns a deleted account's 403 into a 401: "log in again" for an account that cannot.
 *
 * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
 */

import type { AuthContext, Caller } from '@types';

/** Turns a signed token into the user it names. Implemented by `account`. */
export interface AuthResolver {
    fromAccessToken: (token: string) => Promise<AuthContext | undefined>;
    fromRefreshToken: (token: string) => Promise<AuthContext | undefined>;
}

/** The currently registered resolver, or `undefined` before `account` boots and installs one. */
let resolver: AuthResolver | undefined;

/**
 * The prefix every machine credential carries — `sk_<prefix>_<secret>`. A JWT is base64url of
 * `{"alg"`, so it always begins `eyJ`; the two can never collide, which is what lets `getAuth`
 * dispatch on this string alone instead of attempting a JWT parse first. Lives here, not in
 * `api-keys`, because the DISPATCH between the two credential paths is a kernel concern — the same
 * reason the `AuthResolver` port itself lives here rather than in `account`.
 */
export const API_KEY_TOKEN_PREFIX = 'sk_';

/** What a credential resolves to: a `Caller` already floored to the credential's own permissions, and the credential's id for the audit trail. */
export interface ResolvedCredential {
    caller: Caller;
    credentialId: string;
}

/** Turns an opaque bearer credential into the caller it names. Implemented by `api-keys`, when present. */
export interface CredentialResolver {
    fromBearerToken: (token: string) => Promise<ResolvedCredential | undefined>;
}

/** The currently registered credential resolver, or `undefined` when `api-keys` is not part of this build. */
let credentialResolver: CredentialResolver | undefined;

/**
 * Install the resolver. Called once, at import time, by the module that owns authentication.
 *
 * @param implementation - the module's resolver
 */
export const registerAuthResolver = (implementation: AuthResolver): void => {
    resolver = implementation;
};

/**
 * Install the credential resolver. Called once, at import time, by `api-keys/module.ts` — mirrors
 * {@link registerAuthResolver}.
 *
 * @param implementation - the module's resolver
 */
export const registerCredentialResolver = (implementation: CredentialResolver): void => {
    credentialResolver = implementation;
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

/**
 * Resolve an `sk_...` credential, for the machine-to-machine path.
 *
 * Unlike {@link resolveAccessToken}, an unregistered resolver is NOT an error: `account` is
 * load-bearing for every build, but `api-keys` is deletable like any other module. A build without
 * it simply has nothing that can ever mint an `sk_...` token, so one arriving anyway resolves to
 * `undefined` — the same "no caller" outcome as a token whose user no longer exists — rather than
 * throwing.
 */
export const resolveCredential = (token: string): Promise<ResolvedCredential | undefined> =>
    Promise.resolve().then(() => credentialResolver?.fromBearerToken(token));
