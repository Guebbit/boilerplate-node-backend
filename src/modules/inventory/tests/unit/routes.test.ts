/**
 * @module
 * Inventory route table tests. Every route here is staff's, reached past one
 * `router.use(getAuth, isAuthOrCredential)` at the top plus the `inventory.any.*` key each mount
 * names — the customer-facing half of this module is deliberately not a route at all, since a
 * shopper learns about stock from `available` on the product page. A route mounted above the
 * guard, or a mount losing its `requirePermission`, would publish the counters and the ledger
 * to anyone.
 */

import { routeSignatures, guardsOn, identityGuardIndex } from '@tests/routes';
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
        const identity = identityGuardIndex(guards);

        expect(identity).toBeGreaterThanOrEqual(0);
        expect(guards).toContain('requirePermissionGuard');
        expect(identity).toBeLessThan(guards.indexOf('requirePermissionGuard'));
    });

    it('has no public endpoint at all', () => {
        // Positional: this is what fails if a route is ever mounted above the gate.
        const unguarded = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('requirePermissionGuard')
        );

        expect(unguarded).toEqual([]);
    });
});
