/**
 * @module
 * Auth context types: who is making this request ({@link AuthContext}), what an authorization
 * rule may safely read about them ({@link Caller}), and what a service reads about the request
 * that carried them ({@link CallerContext}). Decouples HTTP/auth flow from Mongoose document
 * internals — controllers, middleware and the `@kernel` resolver port depend on these, never on
 * `UserDocument`. `callerContextOf`/`tenantCallerContextOf`, which build a `CallerContext` from a
 * live request, stay in `http/request.ts` — that is HTTP work, not a type.
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
     * The shop this person belongs to — the one shop every account belongs to, `DEPLOYMENT_TENANT_ID`.
     *
     * Read from the account and never from a request parameter, which is what makes a
     * cross-tenant read impossible to express by accident rather than merely discouraged.
     */
    tenantId: string;
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
 *
 * Discriminated on `scope`: a `'tenant'` caller's `tenantId` is a proven `string`, a `'platform'`
 * caller's is proven `null` — narrowing on `scope` is what lets a module read its shop's id with
 * no runtime check and no `!`.
 */
export type Caller = TenantCaller | PlatformCaller;

/**
 * A caller acting inside a shop. The arm is named so a function that only makes sense in tenant
 * scope can DEMAND it — see `TenantCallerContext` — instead of accepting the whole union and
 * narrowing it back at runtime.
 */
export interface TenantCaller {
    scope: 'tenant';
    /** The shop this request acts in — every tenant-scope caller has one, the compiler proves it. */
    tenantId: string;
    /** Who they are, when they are anyone. `null`/absent for a stranger. */
    id?: string | null;
    /** The permission keys the caller's role in that scope holds. */
    permissions: readonly string[];
}

/** A caller acting over the installation itself, which has no shop to be scoped to. */
export interface PlatformCaller {
    scope: 'platform';
    /** Platform scope is tenant-less by definition. */
    tenantId: null;
    /** Who they are, when they are anyone. `null`/absent for a stranger. */
    id?: string | null;
    /** The permission keys the caller's role in that scope holds. */
    permissions: readonly string[];
}

/**
 * Everything a service needs to know about the request that reached it — who made it, where it
 * came from, what language it was made in — built once in the controller and passed down, because
 * the service tier is defined by never seeing a `Request`. Threaded rather than read off an
 * `AsyncLocalStorage` so a missing `CallerContext` is a compile error, not an ALS accessor
 * silently returning the wrong (or no) request across an async boundary.
 *
 * See: docs/tools/analytics.md#caller-context
 */
export interface CallerContext {
    /**
     * The caller as an authorization decision sees them, in TENANT scope.
     *
     * Tenant scope because that is what an audit row and an analytics event are about: something
     * that happened inside a shop. Platform work resolves its own caller per key, in the guard,
     * and never travels on this.
     */
    caller: Caller;
    /**
     * The tenant role name behind {@link caller} — `AuthContext.roles.tenant`, absent when the
     * request never resolved one at all (see `STRANGER` in `http/request.ts`).
     *
     * `caller.permissions` is the expanded key list a rule reads; this is the NAME a person would
     * recognise, kept only for the audit trail's `actor_role_name` — a renamed role invalidates a
     * value read from here, never a decision made from `caller`, which is why the two travel
     * separately instead of one standing in for the other.
     */
    actorRoleName?: string;
    /**
     * The api-key behind {@link caller} — `request.credentialId` — absent for every request that
     * resolved a human session instead. Sibling to {@link actorRoleName} rather than a replacement
     * for it, and kept only for the audit trail's `actor_credential_id`: a row can say "acted via
     * key `sk_a1b2c3d4`" instead of attributing machine traffic to the human who created the key.
     */
    actorCredentialId?: string;
    /** The caller's address, as Express resolved it (trust-proxy aware). */
    ip?: string;
    /** The `User-Agent` the caller sent, if any. */
    userAgent?: string;
    /** The `Host` header the caller sent, if any. */
    host?: string;
    /** The request id assigned by the request-id middleware, for correlating with the access log. */
    requestId?: string;
    /**
     * The language this request was made in, negotiated from `Accept-Language` — the FALLBACK for
     * copy addressed to someone whose own preference is unknown.
     *
     * On this interface, not a second parameter, because without it a service composing email
     * needed `request.locale` reached from the controller, pulling compose-and-enqueue logic up
     * out of services. Optional, and last in precedence: a stored preference is the better answer
     * wherever one exists.
     */
    locale?: string;
    /**
     * The caller's analytics consent choice — the stored `AuthContext.analyticsConsent`, else the
     * `X-Analytics-Consent` header the frontend forwards from the visitor's own banner choice.
     * `false` covers both "denied" and "never asked": `emitAnalyticsEvent`'s gate is opt-in, and
     * it is the only reader.
     */
    analyticsConsent: boolean;
}

/**
 * A {@link CallerContext} whose caller is proven to be acting inside a shop.
 *
 * Exists so a tenant-only module's services can take `context.caller.tenantId` as a `string` and
 * state that requirement in their signature, instead of each one narrowing the union back at
 * runtime. `api-keys` and `webhooks` are entirely tenant-scoped — every key either declares
 * `scope: tenant` in `shared/authorization-keys.yaml` — and both previously carried their own
 * identical `tenantOf()` helper to do exactly that.
 */
export interface TenantCallerContext extends CallerContext {
    caller: TenantCaller;
}
