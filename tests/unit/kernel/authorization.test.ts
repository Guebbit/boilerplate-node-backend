/**
 * The shared read-scoping rule — `src/kernel/authorization.ts`.
 *
 * `createCallerScope` is a combinator: it owns the *yours-or-staff* decision and delegates the
 * "whose" to a scope builder it is handed. These specs assert only the half it owns, with a stub
 * builder, so a failure here names the rule rather than one module's collection:
 *
 *   1. admin        → `undefined`, and the builder is never consulted.
 *   2. anyone else  → whatever the builder returns for their id.
 *   3. no id at all → the builder is called with `''`, so a builder that rejects an empty id
 *                     throws. That delegation IS the fail-closed property: the combinator must
 *                     never substitute a default, skip the call, or swallow the error.
 *
 * `orders/tests/unit/service-scope.test.ts` covers the composed behaviour over a real repository;
 * what is asserted here is the contract those modules are relying on.
 */

import { createCallerScope } from '@kernel/authorization';

const OWNED = { userId: 'scoped' };

describe('createCallerScope', () => {
    it('returns undefined for an admin, meaning no restriction', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        // Not `{}`: an empty object spreads into a filter that still matches everything, but it
        // is a different value from "no restriction" and a caller may branch on it.
        expect(createCallerScope(ownerScopeOf)({ id: 'u1', admin: true })).toBeUndefined();
    });

    it('does not consult the scope builder at all for an admin', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        createCallerScope(ownerScopeOf)({ id: 'u1', admin: true });

        // The builder coerces ids and can throw on a bad one. An admin must not be exposed to
        // that: their pass is the FIRST decision, not a filter computed then discarded.
        expect(ownerScopeOf).not.toHaveBeenCalled();
    });

    it("delegates to the scope builder with the caller's id", () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        expect(createCallerScope(ownerScopeOf)({ id: 'u1', admin: false })).toBe(OWNED);
        expect(ownerScopeOf).toHaveBeenCalledWith('u1');
    });

    it('treats an absent admin flag as not an admin', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        // `admin` is optional. Absent must mean "not an admin", never "unknown, so allow".
        expect(createCallerScope(ownerScopeOf)({ id: 'u1' })).toBe(OWNED);
        expect(ownerScopeOf).toHaveBeenCalledWith('u1');
    });

    it('passes an empty id to the builder rather than skipping the restriction', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        createCallerScope(ownerScopeOf)(undefined);

        // The load-bearing line. Returning `undefined` here — or omitting the owner clause —
        // would widen an anonymous request to every user's rows without failing anything.
        expect(ownerScopeOf).toHaveBeenCalledWith('');
    });

    it('propagates the builder throwing on an empty id', () => {
        const ownerScopeOf = jest.fn((userId: string) => {
            if (!userId) throw new Error('invalid id');
            return OWNED;
        });
        const callerScope = createCallerScope(ownerScopeOf);

        // How the fail-closed property actually surfaces: a 500, never a disclosure.
        expect(() => callerScope(undefined)).toThrow('invalid id');
        expect(() => callerScope({ admin: false })).toThrow('invalid id');
    });

    it('builds independent scopes per repository', () => {
        // Two modules, two collections, one rule — the reason this is a factory and not a
        // function with a switch in it.
        const orders = createCallerScope(() => ({ collection: 'orders' }));
        const payments = createCallerScope(() => ({ collection: 'payments' }));

        expect(orders({ id: 'u1' })).toEqual({ collection: 'orders' });
        expect(payments({ id: 'u1' })).toEqual({ collection: 'payments' });
    });
});
