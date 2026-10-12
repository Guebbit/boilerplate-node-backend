/**
 * @module
 * The delivery route table. Nine routes, three different audiences — the guards are per route, so
 * each one is its own decision rather than an inherited default. That's the arrangement most
 * likely to drift: a new route added here gets no guard at all unless someone remembers, which is
 * what the sweep at the end of this file is for.
 */

import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/delivery/routes';

/** Every door that writes a fulfillment order or a shipment. */
const WRITES = [
    'POST /fulfillment-orders/:id/shipments',
    'POST /fulfillment-orders/:id/fulfill',
    'POST /fulfillment-orders/:id/hold',
    'POST /fulfillment-orders/:id/release',
    'PATCH /shipments/:id',
    'POST /shipments/:id/deliver'
];

describe('delivery routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /methods',
            'GET /order/:orderId',
            'POST /order/:orderId/start',
            'POST /fulfillment-orders/:id/shipments',
            'POST /fulfillment-orders/:id/fulfill',
            'POST /fulfillment-orders/:id/hold',
            'POST /fulfillment-orders/:id/release',
            'POST /fulfillment-orders/:id/confirm-wait',
            'PATCH /shipments/:id',
            'POST /shipments/:id/deliver'
        ]);
    });

    it('keeps the shipping methods public', () => {
        // What shipping costs is pre-purchase information: a shopper deciding whether to buy has
        // no account yet, and hiding the price behind a login loses the sale rather than
        // protecting anything.
        expect(guardsOn(router, 'GET /methods')).not.toContain('isAuth');
    });

    it('requires a session to read the fulfilment behind an order', () => {
        // The fulfilment is tied to one caller's order. The ownership check itself lives in the
        // service; this is the gate that guarantees there is a caller to check.
        const guards = guardsOn(router, 'GET /order/:orderId');

        expect(guards).toContain('isAuth');
        expect(guards).not.toContain('requirePermissionGuard');
    });

    it('restricts starting fulfilment to an operator holding delivery.any.start', () => {
        expect(guardsOn(router, 'POST /order/:orderId/start')).toContain('requirePermissionGuard');
    });

    it.each(WRITES)('restricts %s to an operator', (signature) => {
        // A customer could otherwise move their own order forward, or anyone else's — this is
        // staff's own write, not the order owner's.
        expect(guardsOn(router, signature)).toContain('requirePermissionGuard');
    });

    it("keeps the buyer's keep-waiting answer to a session, with no staff key", () => {
        // It is the order's own buyer's answer, not a permission: the service refuses anyone else.
        const guards = guardsOn(router, 'POST /fulfillment-orders/:id/confirm-wait');

        expect(guards).toContain('isAuth');
        expect(guards).not.toContain('requirePermissionGuard');
    });

    it('leaves nothing but the methods list unauthenticated', () => {
        // The sweep: a route added here without a guard fails this, rather than shipping open.
        const open = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('isAuth')
        );

        expect(open).toEqual(['GET /methods']);
    });
});
