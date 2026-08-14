/**
 * Who is making this request — asked by the kernel, answered by a module.
 *
 * The guard in `kernel/middlewares/authorizations.ts` protects every module's routes, so it cannot
 * import one (`users → account → users` would close a cycle) and cannot do the work itself (which
 * secret signed the token, which collection holds the record — that is domain knowledge). So the
 * kernel declares the port and `account` supplies it at boot, like `AuditSink` and `ImageStore`.
 *
 * TWO OUTCOMES, and callers depend on the difference:
 *
 *   - **Rejects** — token absent, malformed, expired or wrongly signed. `getAuth` carries on
 *     anonymously; `isAdminViaCookie` answers 401.
 *   - **Resolves `undefined`** — token verified, user no longer exists. `isAdminViaCookie` answers
 *     403, because the caller proved who they were.
 *
 * Collapsing them turns a deleted admin's 403 into a 401: "log in again" for an account that cannot.
 */

/** The subset of a user the request context carries. Deliberately not the module's document type. */
export interface AuthenticatedUser {
    id: string;
    email: string;
    username: string;
    admin?: boolean;
    imageUrl?: string;
}

/** Turns a signed token into the user it names. Implemented by `account`. */
export interface AuthResolver {
    fromAccessToken: (token: string) => Promise<AuthenticatedUser | undefined>;
    fromRefreshToken: (token: string) => Promise<AuthenticatedUser | undefined>;
}

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
 * authentication, and every guard must then refuse rather than crash. It rejects for the same
 * reason a bad token does, so the guards need no extra branch.
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
