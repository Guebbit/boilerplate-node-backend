/**
 * @module
 * Auth context types: who is making this request ({@link AuthContext}), and what an authorization
 * rule may safely read about them ({@link Caller}). Decouples HTTP/auth flow from Mongoose
 * document internals — controllers, middleware and the `@kernel` resolver port depend on these,
 * never on `UserDocument`.
 */

/** Which of the two worlds a caller acts in. Spelled here because `Caller` is the type everything reads. */
export type AuthorizationScope = 'tenant' | 'platform';

/**
 * The resolved caller — both the kernel resolver's own answer and the transport-safe shape
 * threaded through the request. One interface, not two, so the resolver's answer and the DTO
 * cannot drift out of field-for-field sync.
 */
export interface AuthContext {
    id: string;
    email: string;
    username: string;
    /**
     * The role names this person holds, one per scope.
     *
     * A person may run a shop AND operate the installation — those are different jobs with
     * different keys, and one field could not say which. What stays true is that a REQUEST acts
     * in exactly one scope: `callerFor` picks the one the key being checked belongs to, so a bare
     * key is never answered from the platform role and a `platform.` key is never answered from
     * the tenant one.
     *
     * A name is data a deployment may rename; a key is code. Nothing decides anything from these
     * directly — `callerFor` turns them into keys first.
     */
    roles: {
        /** The role held inside the shop. Everyone has one; a stranger's is `guest`. */
        tenant: string;
        /** The role held over the installation, or `null` for the overwhelming majority. */
        platform: string | null;
    };
    /**
     * The shop this person belongs to.
     *
     * Read from the account and never from a request parameter, which is what makes a
     * cross-tenant read impossible to express by accident rather than merely discouraged.
     */
    tenantId: string | null;
    imageUrl?: string;
    /**
     * Epoch seconds this session last actually proved itself — carried from the token's own
     * `auth_time` claim, never derived here. `0` means "unknown/never" (a token minted before
     * this claim existed), which reads as infinitely old — see `TokenData` in
     * `account/session/jwt.ts`. `requireFreshAuth` is what reads this; nothing else should need to.
     */
    authTime: number;
    /** How `authTime` was proved — RFC 8176 values, `['pwd']` today. Same source as `authTime`. */
    amr: readonly string[];
    /**
     * The account's analytics consent choice, read fresh from the document on every request.
     * Carried through to `CallerContext` for `emitAnalyticsEvent`'s own gate; nothing else should
     * need to read it.
     */
    analyticsConsent: boolean;
    /**
     * Whether the account's email is proven, read fresh from the document on every request, same
     * reasoning as `analyticsConsent`: a verification landing mid-session (or a pending change
     * completing) must gate the very next request, not wait for a new token.
     * `requireVerified` (`kernel/middlewares/authorizations.ts`) is what reads this; nothing else
     * should need to.
     */
    verified: boolean;
}

/**
 * The auth context as an *authorization decision* sees it.
 *
 * `AuthContext` describes what a resolved caller IS; `Caller` describes what a rule about a
 * caller may safely ASK. The difference is real: `email`, `username`, `roles` and `imageUrl` are
 * identity, not permission, and an authorization rule that reads them is one nobody can audit by
 * its type.
 *
 * `scope` and `permissions` are REQUIRED, and that is the fail-closed half: a caller cannot be
 * assembled half-formed and then silently evaluated against a scope nobody chose. An anonymous
 * request is not a gap to handle but a value to build — `anonymousCaller()` — so "stranger" has
 * one spelling instead of four. `callerFor` is what turns an `AuthContext`'s two role names into
 * exactly one of these, per key.
 *
 * Identity stays optional because a stranger genuinely has none; a rule that needs an id and is
 * handed `undefined` drops its own rule rather than widening — see `resolveConditions`.
 */
export interface Caller {
    /** Who they are, when they are anyone. `null`/absent for a stranger. */
    id?: string | null;
    /** The shop this request acts in. `null` in platform scope, and only there. */
    tenantId?: string | null;
    /** Which of the two worlds this REQUEST acts in — one scope per request, never both. */
    scope: AuthorizationScope;
    /** The permission keys the caller's role in that scope holds. */
    permissions: readonly string[];
}
