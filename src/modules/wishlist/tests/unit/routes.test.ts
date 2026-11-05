/**
 * @module
 * The wishlist route table.
 *
 * A wishlist is somebody's, so the whole router is authenticated and none of it is admin. A saved
 * product is a line of it, written under `/items`.
 */
import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/wishlist/routes';

describe('wishlist routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'POST /items',
            'POST /items/:productId/move-to-cart',
            'DELETE /items/:productId'
        ]);
    });

    it.each([
        'GET /',
        'POST /items',
        'POST /items/:productId/move-to-cart',
        'DELETE /items/:productId'
    ])('%s requires a session', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('is admin-free by design, and asks no key anywhere', () => {
        // There is no operator view of someone else's wishlist. If one appears, this fails and
        // the addition gets looked at. The move into a basket asks nothing either: every account shops.
        const keyGuarded = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('requirePermissionGuard')
        );

        expect(keyGuarded).toEqual([]);
    });
});
