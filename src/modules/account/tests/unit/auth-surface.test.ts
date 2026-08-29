/**
 * `index.ts` is this module's front door, and it is one function wide.
 *
 * A barrel's only failure mode is a missing or misrouted name. A dropped line is a compile error in
 * a dozen files that TypeScript catches — but a line that re-exports the *wrong* binding, or a name
 * silently resolving to `undefined` after a refactor of the underlying file, is not caught by
 * anything. Both cases are covered here: the surface is pinned by name, and the function is checked
 * to be the same object `./services/addresses` exports rather than merely to exist.
 *
 * The token surface is deliberately not part of that front door: the kernel's auth port is what
 * every request goes through, and this module fills it from `module.ts` with relative imports, so
 * no sibling needs a token. The second case below is what stops such an export being added on the
 * theory that one might.
 *
 * Nothing here asserts that outsiders stay off this module's internals. That is a graph question
 * about all thirteen modules rather than about this one, and `module-internals-are-private` in
 * `.dependency-cruiser.cjs` answers it — including for `src/app/`, which every ESLint rule allows
 * to reach past a barrel.
 */

import * as account from '@modules/account';
import * as addresses from '@modules/account/services';

/**
 * Re-exported from `./services/addresses` — the address book's ONE cross-module surface: the
 * cart's checkout resolves which address an order ships to. The CRUD stays internal, served by
 * this module's own routes.
 */
const ADDRESS_EXPORTS = ['addressForCheckout'] as const;

describe('the account barrel', () => {
    it.each(ADDRESS_EXPORTS)('re-exports %s from ./services/addresses unchanged', (name) => {
        // Identity, not existence: a re-export resolving to a different object means the barrel
        // and the implementation have forked, which is the failure a smoke test misses.
        expect(account[name]).toBe(addresses[name]);
    });

    it('exports nothing beyond the declared groups', () => {
        // Widening a barrel is a design decision — it is a promise to every other module that the
        // shape will not move. This case makes that deliberate rather than incidental: a new
        // export fails here until it is written down above.
        expect(Object.keys(account).toSorted()).toEqual([...ADDRESS_EXPORTS].toSorted());
    });
});
