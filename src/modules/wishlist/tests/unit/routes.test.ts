/**
 * The wishlist route table.
 *
 * A wishlist is somebody's, so the whole router is authenticated and none of it is admin. The one
 * thing that can silently break is ORDER: `/:productId/move-to-cart` must be declared before the
 * bare `/:productId` routes, or a move-to-cart is read as a product id called "move-to-cart".
 */
import { routeTable, routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/wishlist/routes';

describe('wishlist routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'POST /',
            'POST /:productId/move-to-cart',
            'DELETE /:productId'
        ]);
    });

    it.each(['GET /', 'POST /', 'POST /:productId/move-to-cart', 'DELETE /:productId'])(
        '%s requires a session',
        (signature) => {
            expect(guardsOn(router, signature)).toContain('isAuth');
        }
    );

    it('is admin-free by design', () => {
        // There is no operator view of someone else's wishlist. If one appears, this fails and
        // the addition gets looked at.
        const adminGuarded = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('isAdmin')
        );

        expect(adminGuarded).toEqual([]);
    });

    it('declares move-to-cart before the bare /:productId route', () => {
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/:productId/move-to-cart')).toBeLessThan(
            paths.indexOf('/:productId')
        );
    });
});
