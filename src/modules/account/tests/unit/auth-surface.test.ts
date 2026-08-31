/**
 * @module
 * `index.ts` is this module's front door, and it is one function wide.
 *
 * A barrel's only failure mode is a missing or misrouted name — a re-export resolving to the WRONG
 * binding compiles fine and is caught by nothing else. This suite pins the surface by name and
 * checks each export is the same object its source module exports, not merely that it exists.
 *
 * The token surface is deliberately absent: the kernel's auth port is what every request goes
 * through, filled from `module.ts` directly, so no sibling needs a token.
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
