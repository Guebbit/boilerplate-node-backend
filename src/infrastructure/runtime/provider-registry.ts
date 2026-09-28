/**
 * @module
 * A named table of interchangeable implementations behind one seam. Antibot, analytics, payments
 * and OAuth each kept their own hand-written `PROVIDERS` map with the same shape — name in,
 * implementation out — so this is that shape, written once (SK-04).
 *
 * Resolution POLICY stays with the caller, on purpose: whether an unknown name throws (antibot,
 * analytics, payments — a typo must not silently downgrade a security control) or resolves to
 * `undefined` (OAuth, where "not configured" is routine) differs per port. This registry only
 * stores and looks up; `environmentChoice` or a plain `resolve()` call is what expresses that
 * difference, one caller at a time.
 */

/**
 * The seam every one of this build's provider registries exposes: register an implementation
 * under a name, list what is registered, resolve one back by name.
 */
export interface ProviderRegistry<T> {
    /**
     * Register — or, in a test, override — one named implementation.
     * @param name - the key a caller resolves this implementation by
     * @param provider - the implementation itself
     */
    register(name: string, provider: T): void;

    /** Every name currently registered, in insertion order. */
    names(): string[];

    /**
     * The implementation registered under this name.
     * @param name - the key to look up
     * @returns the implementation, or `undefined` when nothing is registered under that name
     */
    resolve(name: string): T | undefined;
}

/**
 * Build a registry seeded with the given implementations.
 *
 * `T` is deliberately unconstrained: a plain implementation for antibot, analytics and payments,
 * or a lazily-evaluated factory (`() => OAuthProvider | undefined`) for OAuth, where more than
 * one provider may be enabled at once and "configured" can change between calls. The registry
 * only stores and looks up — it never invokes `T` itself.
 *
 * @param initial - implementations to seed the registry with, keyed by name
 */
export const createProviderRegistry = <T>(initial: Record<string, T> = {}): ProviderRegistry<T> => {
    const providers = new Map<string, T>(Object.entries(initial));

    return {
        register: (name, provider) => {
            providers.set(name, provider);
        },
        names: () => [...providers.keys()],
        resolve: (name) => providers.get(name)
    };
};
