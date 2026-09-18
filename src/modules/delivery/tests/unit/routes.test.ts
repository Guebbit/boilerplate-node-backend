/**
 * @module
 * The delivery route table. Four routes, three different audiences — the guards are per route,
 * so each one is its own decision rather than an inherited default. That's the arrangement most
 * likely to drift: a fifth route added here gets no guard at all unless someone remembers, which
 * is what the sweep at the end of this file is for.
 */

import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/delivery/routes';

describe('delivery routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /methods',
            'GET /order/:orderId',
            'POST /order/:orderId/ship',
            'POST /order/:orderId/deliver'
        ]);
    });

    it('keeps the shipping methods public', () => {
        // What shipping costs is pre-purchase information: a shopper deciding whether to buy has
        // no account yet, and hiding the price behind a login loses the sale rather than
        // protecting anything.
        expect(guardsOn(router, 'GET /methods')).not.toContain('isAuth');
    });

    it('requires a session to read the parcel behind an order', () => {
        // The shipment is tied to one caller's order. The ownership check itself lives in the
        // controller/service; this is the gate that guarantees there is a caller to check.
        const guards = guardsOn(router, 'GET /order/:orderId');

        expect(guards).toContain('isAuth');
        expect(guards).not.toContain('requirePermissionGuard');
    });

    it('restricts recording a shipment to an operator', () => {
        // A customer could otherwise move their own order forward, or anyone else's — this is
        // staff's own write, not the order owner's.
        expect(guardsOn(router, 'POST /order/:orderId/ship')).toContain('requirePermissionGuard');
    });

    it('restricts recording a delivery to an operator', () => {
        expect(guardsOn(router, 'POST /order/:orderId/deliver')).toContain(
            'requirePermissionGuard'
        );
    });

    it('leaves nothing but the methods list unauthenticated', () => {
        // The sweep: a route added here without a guard fails this, rather than shipping open.
        const open = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('isAuth')
        );

        expect(open).toEqual(['GET /methods']);
    });
});
