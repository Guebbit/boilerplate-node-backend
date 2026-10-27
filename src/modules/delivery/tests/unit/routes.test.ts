/**
 * @module
 * The delivery route table. Nine routes, three different audiences — the guards are per route, so
 * each one is its own decision rather than an inherited default. That's the arrangement most
 * likely to drift: a new route added here gets no guard at all unless someone remembers, which is
 * what the sweep at the end of this file is for.
 */

import { routeSignatures, routeTable, guardsOn } from '@tests/routes';
import { router } from '@modules/delivery/routes';
import { orderRouter } from '@modules/delivery/order-routes';

/** Every door that writes a fulfillment order or a shipment. */
const WRITES = [
    'POST /fulfillment-orders/:id/shipments',
    'POST /fulfillment-orders/:id/fulfill',
    'POST /fulfillment-orders/:id/hold',
    'POST /fulfillment-orders/:id/release',
    'PATCH /shipments/:id',
    'POST /shipments/:id/deliver',
    'POST /shipments/:id/lost'
];

describe('delivery routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /methods',
            'GET /fulfillment-orders',
            'GET /fulfillment-orders/summary',
            'GET /fulfillment-orders/release-date-impact',
            'GET /fulfillment-orders/restock-date-impact',
            'GET /fulfillment-orders/:id',
            'POST /fulfillment-orders/:id/shipments',
            'POST /fulfillment-orders/:id/fulfill',
            'POST /fulfillment-orders/:id/hold',
            'POST /fulfillment-orders/:id/release',
            'GET /shipments/:id',
            'PATCH /shipments/:id',
            'POST /shipments/:id/deliver',
            'POST /shipments/:id/lost'
        ]);
    });

    it('keeps the shipping methods public', () => {
        // What shipping costs is pre-purchase information: a shopper deciding whether to buy has
        // no account yet, and hiding the price behind a login loses the sale rather than
        // protecting anything.
        expect(guardsOn(router, 'GET /methods')).not.toContain('isAuth');
    });

    it.each(['GET /:id/fulfillment-orders', 'GET /:id/shipments'])(
        'requires a session and the order key to read %s',
        (signature) => {
            // The fulfilment is tied to one caller's order. The ownership check itself lives in the
            // service; this is the gate that guarantees there is a caller to check.
            const guards = guardsOn(orderRouter, signature);

            expect(guards).toContain('isAuth');
            expect(guards).toContain('requirePermissionGuard');
        }
    );

    it('mounts the process door and the two lists under /orders, the door restricted to an operator holding start:Shipment', () => {
        expect(routeSignatures(orderRouter)).toEqual([
            'POST /:id/process',
            'GET /:id/fulfillment-orders',
            'GET /:id/shipments'
        ]);
        expect(guardsOn(orderRouter, 'POST /:id/process')).toContain('requirePermissionGuard');
    });

    it.each(WRITES)('restricts %s to an operator', (signature) => {
        // A customer could otherwise move their own order forward, or anyone else's — this is
        // staff's own write, not the order owner's.
        expect(guardsOn(router, signature)).toContain('requirePermissionGuard');
    });

    it.each(['release-date-impact', 'restock-date-impact'])(
        'asks for the product key AND the order key on the %s preview',
        (name) => {
            // Moving the date is the editor's job, counting the orders it concerns is not: both keys.
            const signature = `GET /fulfillment-orders/${name}`;
            const row = routeTable(router).find(
                ({ method, path }) => `${method} ${path}` === signature
            );

            expect(guardsOn(router, signature)).toContain('isAuth');
            expect(row?.permissions.map(({ action, subject }) => `${action}:${subject}`)).toEqual([
                'update:Product',
                'display:Order'
            ]);
        }
    );

    it('leaves nothing but the methods list unauthenticated', () => {
        // The sweep: a route added here without a guard fails this, rather than shipping open.
        const open = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('isAuth')
        );

        expect(open).toEqual(['GET /methods']);
    });
});
