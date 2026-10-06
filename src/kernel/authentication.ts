/**
 * @module
 * Who is making this request — a port the kernel declares and `account` supplies at boot. Three
 * outcomes, and callers depend on the difference:
 *
 * Miss:        resolves `{ miss: reason }` — token malformed, expired, wrongly signed or revoked.
 * Nobody:      resolves `{ ok: undefined }` — token verified, user no longer exists.
 * Outage:      rejects — Mongo/Redis unreachable. Never a "your credentials are wrong".
 *
 * Collapsing the first two turns a deleted account's 403 into a 401: "log in again" for an account
 * that cannot. The miss REASON is what the guard counts and audits.
 *
 * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
 */

import type { AuthContext, Caller } from '@types';

/**
 * Why a presented credential was refused. `invalid_signature` and `malformed` are an attack on a
 * credential; `revoked` and `expired` are normally a customer holding a stale one.
 */
export type ResolveMissReason = 'invalid_signature' | 'malformed' | 'revoked' | 'expired';

/** What a resolver answers: the resolved value, or the reason the credential was refused. */
export type Resolution<T> = { ok: T } | { miss: ResolveMissReason };

/** Turns a signed token into the user it names. Implemented by `account`. */
export interface AuthResolver {
    fromAccessToken: (token: string) => Promise<Resolution<AuthContext | undefined>>;
    fromRefreshToken: (token: string) => Promise<Resolution<AuthContext | undefined>>;
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
    fromBearerToken: (token: string) => Promise<Resolution<ResolvedCredential>>;
}

/** The currently registered credential resolver, or `undefined` when `api-keys` is not part of this build. */
let credentialResolver: CredentialResolver | undefined;

/**
 * Install the resolver. Called once, by the owning module's `onRegistered`.
 *
 * @param implementation - the module's resolver
 */
export const registerAuthResolver = (implementation: AuthResolver): void => {
    resolver = implementation;
};

/**
 * Install the credential resolver. Called once, by `api-keys/module.ts`'s `onRegistered` — mirrors
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
 * authentication. Rejecting for the same reason a bad token does means the guards need no branch —
 * and a plain `Error` is never an infrastructure failure, so `getAuth` still proceeds anonymous.
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
export const resolveAccessToken = (token: string): Promise<Resolution<AuthContext | undefined>> =>
    Promise.resolve().then(() => requireResolver().fromAccessToken(token));

/** Resolve a refresh token, for the cookie path. */
export const resolveRefreshToken = (token: string): Promise<Resolution<AuthContext | undefined>> =>
    Promise.resolve().then(() => requireResolver().fromRefreshToken(token));

/**
 * Resolve an `sk_...` credential, for the machine-to-machine path.
 *
 * Unlike {@link resolveAccessToken}, an unregistered resolver is NOT an error: `account` is
 * load-bearing for every build, but `api-keys` is deletable like any other module. A build without
 * it simply has nothing that can ever mint an `sk_...` token, so one arriving anyway is a
 * `malformed` miss — the same "no caller" outcome — rather than a throw.
 */
export const resolveCredential = (token: string): Promise<Resolution<ResolvedCredential>> =>
    Promise.resolve().then(
        () => credentialResolver?.fromBearerToken(token) ?? { miss: 'malformed' as const }
    );
