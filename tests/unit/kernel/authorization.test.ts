/**
 * The shared read-scoping rule — `src/kernel/authorization.ts`.
 *
 * Two combinators over one decision — *an admin is unrestricted, everyone else is narrowed* —
 * differing only in what the narrowing needs. `createOwnerScope` hands the caller's id to a
 * builder; `createVisibilityScope` calls one that takes nothing, because what a visitor may read
 * is a property of the row. These specs assert only the half the kernel owns, with stub builders,
 * so a failure here names the rule rather than one module's collection:
 *
 *   1. admin        → `undefined`, and the builder is never consulted.
 *   2. anyone else  → whatever the builder returns.
 *   3. no id at all → `createOwnerScope`'s builder is called with `''`, so a builder that rejects
 *                     an empty id throws. That delegation IS the fail-closed property: the
 *                     combinator must never substitute a default, skip the call, or swallow it.
 *
 * `orders/tests/unit/service-scope.test.ts` covers the composed behaviour over a real repository;
 * what is asserted here is the contract those modules are relying on.
 */

import { createOwnerScope, createVisibilityScope } from '@kernel/authorization';

const OWNED = { userId: 'scoped' };
const PUBLISHED = { active: true };

describe('createOwnerScope', () => {
    it('returns undefined for an admin, meaning no restriction', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        // Not `{}`: an empty object spreads into a filter that still matches everything, but it
        // is a different value from "no restriction" and a caller may branch on it.
        expect(createOwnerScope(ownerScopeOf)({ id: 'u1', admin: true })).toBeUndefined();
    });

    it('does not consult the scope builder at all for an admin', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        createOwnerScope(ownerScopeOf)({ id: 'u1', admin: true });

        // The builder coerces ids and can throw on a bad one. An admin must not be exposed to
        // that: their pass is the FIRST decision, not a filter computed then discarded.
        expect(ownerScopeOf).not.toHaveBeenCalled();
    });

    it("delegates to the scope builder with the caller's id", () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        expect(createOwnerScope(ownerScopeOf)({ id: 'u1', admin: false })).toBe(OWNED);
        expect(ownerScopeOf).toHaveBeenCalledWith('u1');
    });

    it('treats an absent admin flag as not an admin', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        // `admin` is optional. Absent must mean "not an admin", never "unknown, so allow".
        expect(createOwnerScope(ownerScopeOf)({ id: 'u1' })).toBe(OWNED);
        expect(ownerScopeOf).toHaveBeenCalledWith('u1');
    });

    it('passes an empty id to the builder rather than skipping the restriction', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        createOwnerScope(ownerScopeOf)(undefined);

        // The load-bearing line. Returning `undefined` here — or omitting the owner clause —
        // would widen an anonymous request to every user's rows without failing anything.
        expect(ownerScopeOf).toHaveBeenCalledWith('');
    });

    it('propagates the builder throwing on an empty id', () => {
        const ownerScopeOf = jest.fn((userId: string) => {
            if (!userId) throw new Error('invalid id');
            return OWNED;
        });
        const callerScope = createOwnerScope(ownerScopeOf);

        // How the fail-closed property actually surfaces: a 500, never a disclosure.
        expect(() => callerScope(undefined)).toThrow('invalid id');
        expect(() => callerScope({ admin: false })).toThrow('invalid id');
    });

    it('builds independent scopes per repository', () => {
        // Two modules, two collections, one rule — the reason this is a factory and not a
        // function with a switch in it.
        const orders = createOwnerScope(() => ({ collection: 'orders' }));
        const payments = createOwnerScope(() => ({ collection: 'payments' }));

        expect(orders({ id: 'u1' })).toEqual({ collection: 'orders' });
        expect(payments({ id: 'u1' })).toEqual({ collection: 'payments' });
    });
});

describe('createVisibilityScope', () => {
    it('returns undefined for an admin, meaning no restriction', () => {
        const publicScopeOf = jest.fn(() => PUBLISHED);

        expect(createVisibilityScope(publicScopeOf)({ id: 'u1', admin: true })).toBeUndefined();
        expect(publicScopeOf).not.toHaveBeenCalled();
    });

    it('narrows a guest and a signed-in non-admin identically', () => {
        const publicScopeOf = jest.fn(() => PUBLISHED);
        const callerScope = createVisibilityScope(publicScopeOf);

        // The distinction the positional boolean could not express: these are two different
        // callers, and the rule says they see the same rows. A boolean makes them one input.
        expect(callerScope(undefined)).toBe(PUBLISHED);
        expect(callerScope({ id: 'u1', admin: false })).toBe(PUBLISHED);
        expect(callerScope({ id: 'u1' })).toBe(PUBLISHED);
    });

    it('never passes the caller to the builder', () => {
        const publicScopeOf = jest.fn(() => PUBLISHED);

        createVisibilityScope(publicScopeOf)({ id: 'u1', admin: false });

        // What a visitor may read is a property of the ROW. A builder that could see the caller
        // would invite an identity condition into a rule that must not have one.
        expect(publicScopeOf).toHaveBeenCalledWith();
    });
});
