/**
 * @module
 * The cart route table. Every route is authenticated at the router level, and only `/checkout` is
 * keyed — `cart.self.checkout`, an unproven address must not be able to spend, see
 * `shared/authorization-keys.yaml`. Mostly guards ORDER: `/summary`, `/checkout`,
 * `/reorder/:orderId` and `/all` compete with `/:productId`, and Express takes the first match —
 * declared the other way round, `DELETE /cart/all` becomes a product lookup for id "all".
 */

import { routeTable, routeSignatures, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);

import { router } from '@modules/cart/routes';

const ALL = [
    'GET /summary',
    'POST /checkout',
    'POST /reorder/:orderId',
    'GET /',
    'POST /',
    'DELETE /all',
    'DELETE /',
    'PUT /:productId',
    'DELETE /:productId'
];

describe('cart routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual(ALL);
    });

    it('declares the literal segments before /:productId', () => {
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/summary')).toBeLessThan(paths.indexOf('/:productId'));
        expect(paths.indexOf('/checkout')).toBeLessThan(paths.indexOf('/:productId'));
        expect(paths.indexOf('/all')).toBeLessThan(paths.indexOf('/:productId'));
    });
});

describe('cart routes — authorization', () => {
    it.each(ALL)('%s requires a logged-in caller', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('keys only /checkout, with cart.self.checkout — by design', () => {
        // A cart belongs to its owner and to nobody else; what you may do with your own basket
        // follows from being signed in, not from a role. Spending it is the one exception — an
        // unverified account may not — which is why `cart.self.checkout` is the only key this module
        // declares in `shared/authorization-keys.yaml`. If a second keyed route is added, this
        // fails and the addition gets looked at.
        const keyed = ALL.filter((signature) =>
            guardsOn(router, signature).includes('requirePermissionGuard')
        );

        expect(keyed).toEqual(['POST /checkout']);
        expect(routeTable(router).find(({ path }) => path === '/checkout')?.permissionKey).toBe(
            'cart.self.checkout'
        );
    });
});

describe('cart routes — caching', () => {
    it('clears orders and products at checkout, where both actually change', () => {
        // Checkout is the one cart route with effects outside the cart: it creates an order and
        // commits reserved stock. Nothing else here changes a cacheable resource.
        expect(chainOf(router, 'POST /checkout')).toContain('invalidateCache([orders|products])');
    });

    it('caches nothing, because a cart is per-caller state', () => {
        // A shared cache keyed without the caller would serve one shopper's cart to another. The
        // absence is the invariant, so it is asserted rather than assumed.
        const cached = ALL.filter((signature) =>
            chainOf(router, signature).some((entry) => entry.startsWith('setCache'))
        );

        expect(cached).toEqual([]);
    });
});
