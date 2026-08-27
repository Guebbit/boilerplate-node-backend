/**
 * The delivery route table.
 *
 * Three routes, three different audiences — and the guards are per route, so each one is its own
 * decision rather than an inherited default. That is the arrangement most likely to drift: adding
 * a fourth route here gets no guard at all unless someone remembers, which is what the sweep at
 * the end of this file is for.
 */
import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/delivery/routes';

describe('delivery routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /methods',
            'GET /order/:orderId',
            'POST /advance'
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
        expect(guards).not.toContain('isAdmin');
    });

    it('restricts the courier tick to an operator', () => {
        // `POST /advance` moves every parcel forward — an operator standing in for a cron. Open
        // to any logged-in caller, a customer could advance the whole shop's deliveries.
        expect(guardsOn(router, 'POST /advance')).toContain('isAdmin');
    });

    it('leaves nothing but the methods list unauthenticated', () => {
        // The sweep: a route added here without a guard fails this, rather than shipping open.
        const open = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('isAuth')
        );

        expect(open).toEqual(['GET /methods']);
    });
});
