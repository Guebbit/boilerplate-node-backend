/**
 * @module
 * Who is making this request — a port the kernel declares and `account` supplies at boot. Three
 * outcomes, and callers depend on the difference:
 *
 * Miss:        resolves `{ miss: reason }` — token malformed, expired, wrongly signed or revoked.
 * Nobody:      resolves `{ ok: undefined }` — token verified, user no longer exists.
 * Outage:      rejects — Mongo/Redis unreachable. Never a "your credentials are wrong".
 *
 * The guard answers both the first two with 401, so a caller cannot tell a bad token from a deleted
 * account. The miss REASON is what the guard counts and audits.
 *
 * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
 */

import type { Response } from 'express';
import type { AuthContext, Caller, Resolution } from '@types';

export type { Resolution, ResolveMissReason } from '@types';

/** What an SSE stream holds on to between its connect and its periodic recheck. */
export interface StreamWatch {
    /** The caller the cookie names right now, as {@link AuthResolver.fromCookie} would answer. */
    context: AuthContext | undefined;
    /**
     * Re-answers "who is this, still?" for as long as the session's FAMILY lives, however many
     * times its credential is rotated or replaced in the meantime. A stream outlives one credential.
     */
    recheck: () => Promise<Resolution<AuthContext | undefined>>;
}

/**
 * Turns a session credential into the user it names. Implemented by `account`, which knows what
 * the credential is (a signed access token, or an opaque `ses_…` id) — the kernel only knows where
 * on the request it travels.
 */
export interface AuthResolver {
    /** The value of `Authorization: Bearer …`, when it is not an `sk_…` key. */
    fromBearer: (token: string) => Promise<Resolution<AuthContext | undefined>>;
    /** The value of the session cookie. */
    fromCookie: (token: string) => Promise<Resolution<AuthContext | undefined>>;
    /** The session cookie of an SSE stream: who it names now, and a recheck that survives rotation. */
    watchCookie: (token: string) => Promise<Resolution<StreamWatch>>;
    /**
     * Whether the session cookie authenticates EVERY route, or only the two SSE streams that cannot
     * send a header. Answered per call: it follows the deployment's session mode.
     */
    cookieAuthenticates: () => boolean;
    /**
     * Clear a session cookie the resolver refused, so the browser stops sending a credential that
     * can never work again. The flags a clear must match live with the module that set the cookie.
     */
    clearDeadCookie: (response: Response) => void;
}

/** The currently registered resolver, or `undefined` before `account` boots and installs one. */
let resolver: AuthResolver | undefined;

/**
 * The prefix every opaque session id carries — `ses_<random>`. Like {@link API_KEY_TOKEN_PREFIX} it
 * is a plain string the dispatch can test, and it can collide with neither a JWT (`eyJ…`) nor a
 * machine key.
 */
export const SESSION_TOKEN_PREFIX = 'ses_';

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

/** Resolve a bearer credential — an access token, or a `ses_…` session id. */
export const resolveBearer = (token: string): Promise<Resolution<AuthContext | undefined>> =>
    Promise.resolve().then(() => requireResolver().fromBearer(token));

/** Resolve the session cookie of an SSE stream, keeping what its recheck needs. */
export const watchCookie = (token: string): Promise<Resolution<StreamWatch>> =>
    Promise.resolve().then(() => requireResolver().watchCookie(token));

/** Resolve the session cookie's value. */
export const resolveCookie = (token: string): Promise<Resolution<AuthContext | undefined>> =>
    Promise.resolve().then(() => requireResolver().fromCookie(token));

/** Clear a session cookie the resolver refused; a build with no `account` has none to clear. */
export const clearDeadSessionCookie = (response: Response): void => {
    resolver?.clearDeadCookie(response);
};

/**
 * Whether the session cookie authenticates ordinary routes. `false` when no resolver is
 * registered: a build with no `account` has no sessions at all.
 */
export const cookieAuthenticatesRequests = (): boolean => resolver?.cookieAuthenticates() ?? false;

/**
 * Resolve an `sk_...` credential, for the machine-to-machine path.
 *
 * Unlike {@link resolveBearer}, an unregistered resolver is NOT an error: `account` is
 * load-bearing for every build, but `api-keys` is deletable like any other module. A build without
 * it simply has nothing that can ever mint an `sk_...` token, so one arriving anyway is a
 * `malformed` miss — the same "no caller" outcome — rather than a throw.
 */
export const resolveCredential = (token: string): Promise<Resolution<ResolvedCredential>> =>
    Promise.resolve().then(
        () => credentialResolver?.fromBearerToken(token) ?? { miss: 'malformed' as const }
    );
