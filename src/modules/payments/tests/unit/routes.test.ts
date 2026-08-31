/**
 * @module
 * The payments route table.
 *
 * Everything is authenticated at the router level — money is somebody's — and exactly one route
 * is additionally admin-only: the refund. That asymmetry is the whole file. A refund open to any
 * logged-in caller is a self-service withdrawal; an intent or a confirm locked to admins is a
 * checkout nobody can complete.
 */

import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/payments/routes';

describe('payment routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'POST /intent',
            'GET /order/:orderId',
            'POST /order/:orderId/refund',
            'POST /:id/confirm'
        ]);
    });

    it.each(routeSignatures(router))('%s requires a session', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('admin-guards the refund, and only the refund', () => {
        // The one route that moves money back out. Everything else is the customer's own
        // checkout, which they must be able to complete themselves.
        const adminGuarded = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('isAdmin')
        );

        expect(adminGuarded).toEqual(['POST /order/:orderId/refund']);
    });

    it('declares the refund before the bare /:id route', () => {
        // `/order/:orderId/refund` is three segments and `/:id/confirm` is two, so they cannot
        // collide today. The ordering is the convention this module states, and asserting it
        // stops a two-segment admin route added later from being shadowed.
        const paths = routeSignatures(router);

        expect(paths.indexOf('POST /order/:orderId/refund')).toBeLessThan(
            paths.indexOf('POST /:id/confirm')
        );
    });
});
