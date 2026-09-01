/**
 * @module
 * Auth context types: what a resolved caller looks like on the wire ({@link AuthContext}), and
 * what an authorization rule may safely read about one ({@link Caller}). Decouples HTTP/auth flow
 * from Mongoose document internals — controllers and middleware depend on these, never on
 * `UserDocument`.
 */

/** Transport-safe auth context DTO. Controllers and middleware depend on this, not UserDocument. */
export interface AuthContext {
    id: string;
    email: string;
    username: string;
    admin: boolean;
    imageUrl?: string;
    /**
     * Epoch seconds this session last actually proved itself — BETTER_SECURITY.md wave 4, carried
     * from `AuthenticatedUser`. `requireFreshAuth` is what reads this; nothing else should need
     * to.
     */
    authTime: number;
    /** How `authTime` was proved — RFC 8176 values, `['pwd']` today. Wave 4, same source. */
    amr: readonly string[];
}

/**
 * The auth context as an *authorization decision* sees it — both fields optional.
 *
 * `AuthContext` describes what a resolved caller IS; `Caller` describes what a rule about a
 * caller may safely ASK. The difference is real: a service takes `authContext?` because the
 * request may be anonymous, and every such signature was restating `{ id?: string; admin?:
 * boolean }` inline. Narrower than `Partial<AuthContext>` on purpose — `email`, `username` and
 * `imageUrl` are identity, not permission, and an authorization rule that reads them is one
 * nobody can audit by its type.
 */
export type Caller = Partial<Pick<AuthContext, 'id' | 'admin'>>;
