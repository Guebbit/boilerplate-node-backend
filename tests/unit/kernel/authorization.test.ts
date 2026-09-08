/**
 * The shared read-scoping rule — `src/kernel/authorization.ts`.
 *
 * Two combinators over one decision — *an admin is unrestricted, everyone else is narrowed* —
 * differing only in what the narrowing needs. `createOwnerScope` hands the caller's id to a
 * builder; `createVisibilityScope` calls one that takes nothing, because what a visitor may read
 * is a property of the row. These specs assert only the half the kernel owns, with stub builders,
 * so a failure here names the rule rather than one module's collection:
 *
 *   1. a role holding the subject's WIDE key → `undefined`, and the builder is never consulted.
 *   2. anyone else                          → whatever the builder returns.
 *   3. no caller at all                     → `createOwnerScope`'s builder is called with `''`, so
 *                                             a builder that rejects an empty id throws. That
 *                                             delegation IS the fail-closed property: the
 *                                             combinator must never substitute a default, skip the
 *                                             call, or swallow it.
 *
 * The question is asked of the ABILITY, not of a role name, so these specs are written one case
 * per role: `owner` reads everything, `customer` and a stranger read the same narrowed slice. A
 * boolean made the last two one input, which is exactly the distinction worth asserting.
 *
 * `orders/tests/unit/service-scope.test.ts` covers the composed behaviour over a real repository;
 * what is asserted here is the contract those modules are relying on.
 */

import { createOwnerScope, createVisibilityScope } from '@kernel/authorization';
import { asCustomer, asOwner } from '../../support/callers';

const OWNED = { userId: 'scoped' };
const PUBLISHED = { active: true };

/* The two subjects these factories are actually bound to in the modules that use them. */
const ORDER = 'Order';
const PRODUCT = 'Product';

describe('createOwnerScope', () => {
    it('returns undefined for a role that reads everything, meaning no restriction', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        // Not `{}`: an empty object spreads into a filter that still matches everything, but it
        // is a different value from "no restriction" and a caller may branch on it.
        expect(createOwnerScope(ORDER, ownerScopeOf)(asOwner('u1'))).toBeUndefined();
    });

    it('does not consult the scope builder at all for such a role', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        createOwnerScope(ORDER, ownerScopeOf)(asOwner('u1'));

        // The builder coerces ids and can throw on a bad one. An unrestricted caller must not be
        // exposed to that: their pass is the FIRST decision, not a filter computed then discarded.
        expect(ownerScopeOf).not.toHaveBeenCalled();
    });

    it("delegates to the scope builder with the caller's id", () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        expect(createOwnerScope(ORDER, ownerScopeOf)(asCustomer('u1'))).toBe(OWNED);
        expect(ownerScopeOf).toHaveBeenCalledWith('u1');
    });

    it('passes an empty id to the builder rather than skipping the restriction', () => {
        const ownerScopeOf = jest.fn(() => OWNED);

        createOwnerScope(ORDER, ownerScopeOf)(undefined);

        // The load-bearing line. Returning `undefined` here — or omitting the owner clause —
        // would widen an anonymous request to every user's rows without failing anything.
        expect(ownerScopeOf).toHaveBeenCalledWith('');
    });

    it('propagates the builder throwing on an empty id', () => {
        const ownerScopeOf = jest.fn((userId: string) => {
            if (!userId) throw new Error('invalid id');
            return OWNED;
        });
        const callerScope = createOwnerScope(ORDER, ownerScopeOf);

        // How the fail-closed property actually surfaces: a 500, never a disclosure.
        expect(() => callerScope(undefined)).toThrow('invalid id');
        expect(() => callerScope(asCustomer(''))).toThrow('invalid id');
    });

    it('builds independent scopes per repository', () => {
        // Two modules, two collections, one rule — the reason this is a factory and not a
        // function with a switch in it.
        const orders = createOwnerScope(ORDER, () => ({ collection: 'orders' }));
        const payments = createOwnerScope('Payment', () => ({ collection: 'payments' }));

        expect(orders(asCustomer('u1'))).toEqual({ collection: 'orders' });
        expect(payments(asCustomer('u1'))).toEqual({ collection: 'payments' });
    });
});

describe('createVisibilityScope', () => {
    it('returns undefined for a role that reads everything, meaning no restriction', () => {
        const publicScopeOf = jest.fn(() => PUBLISHED);

        expect(createVisibilityScope(PRODUCT, publicScopeOf)(asOwner('u1'))).toBeUndefined();
        expect(publicScopeOf).not.toHaveBeenCalled();
    });

    it('narrows a guest and a signed-in customer identically', () => {
        const publicScopeOf = jest.fn(() => PUBLISHED);
        const callerScope = createVisibilityScope(PRODUCT, publicScopeOf);

        // The distinction the positional boolean could not express: these are two different
        // callers, and the rule says they see the same rows. A boolean makes them one input.
        expect(callerScope(undefined)).toBe(PUBLISHED);
        expect(callerScope(asCustomer('u1'))).toBe(PUBLISHED);
    });

    it('never passes the caller to the builder', () => {
        const publicScopeOf = jest.fn(() => PUBLISHED);

        createVisibilityScope(PRODUCT, publicScopeOf)(asCustomer('u1'));

        // What a visitor may read is a property of the ROW. A builder that could see the caller
        // would invite an identity condition into a rule that must not have one.
        expect(publicScopeOf).toHaveBeenCalledWith();
    });
});
