/**
 * @module
 * The cart route table. Every route is authenticated at the router level and needs
 * `cart.self.update` (shoppers only: staff and administrators own no basket); `/checkout` also
 * needs `cart.self.checkout`, since an unproven address must not be able to spend, see
 * `shared/authorization-keys.yaml`. Mostly guards ORDER: `/summary`, `/checkout`,
 * `/reorder/:orderId`, `/all` and `/shipping-method` compete with `/:productId`, and Express takes
 * the first match — declared the other way round, `DELETE /cart/all` becomes a product lookup for
 * id "all".
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
    'PUT /shipping-method',
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
        expect(paths.indexOf('/shipping-method')).toBeLessThan(paths.indexOf('/:productId'));
    });
});

describe('cart routes — authorization', () => {
    it.each(ALL)('%s requires a logged-in caller', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });
});

describe('cart routes — who shops', () => {
    // The key is mounted once, router-wide, so a route added later inherits it instead of having
    // to remember it.
    it.each(ALL)('%s needs the shopper key, and only after a session is proven', (signature) => {
        const guards = guardsOn(router, signature);

        expect(guards).toContain('requirePermissionGuard');
        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('requirePermissionGuard'));
    });
});

describe('cart routes — caching', () => {
    it('clears products at checkout, where stock actually changes', () => {
        // Checkout is the one cart route with effects outside the cart: it commits reserved stock.
        // Orders are never Redis-cached, so there is no `orders` entry to clear.
        expect(chainOf(router, 'POST /checkout')).toContain('invalidateCache([products])');
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
