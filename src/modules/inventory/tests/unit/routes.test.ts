/**
 * @module
 * Inventory route table tests. Every route here is staff's, guarded by one
 * `router.use(getAuth, isAuth, isAdmin)` at the top — the customer-facing half of this module is
 * deliberately not a route at all, since a shopper learns about stock from `available` on the
 * product page. A route mounted above the guard, or the guard losing `isAdmin`, would publish
 * the counters and the ledger to anyone.
 */

import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/inventory/routes';

describe('inventory routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /levels',
            'GET /movements',
            'POST /receipts',
            'POST /adjustments',
            'POST /reservations/sweep'
        ]);
    });

    it.each([
        'GET /levels',
        'GET /movements',
        'POST /receipts',
        'POST /adjustments',
        'POST /reservations/sweep'
    ])('%s is reachable only by an authenticated admin', (signature) => {
        const guards = guardsOn(router, signature);

        expect(guards).toContain('getAuth');
        expect(guards).toContain('isAuth');
        expect(guards).toContain('isAdmin');
        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('isAdmin'));
    });

    it('has no public endpoint at all', () => {
        // Positional: this is what fails if a route is ever mounted above the gate.
        const unguarded = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('isAdmin')
        );

        expect(unguarded).toEqual([]);
    });
});
