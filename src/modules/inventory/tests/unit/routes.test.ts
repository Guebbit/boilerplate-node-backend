/**
 * The inventory route table.
 *
 * Every route here is staff's, guarded by one `router.use(getAuth, isAuth, isAdmin)` at the top.
 * The customer-facing half of this module is deliberately not a route at all — a shopper learns
 * about stock from `available` on the product they are looking at.
 *
 * That makes the failure mode here specific and severe: a single route mounted above the `use`,
 * or the `use` losing `isAdmin`, publishes the counters and the ledger. The module's own comment
 * says why that matters — it tells competitors what sells and tells customers how close they are
 * to missing out, which is a dark pattern when true and a lie when not.
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
