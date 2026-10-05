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

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/cart/routes';

const ALL = [
    'GET /summary',
    'POST /checkout',
    'POST /merge',
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

describe('cart routes — the checkout budget', () => {
    it('budgets the checkout, and only the checkout', () => {
        expect(chainOf(router, 'POST /checkout')).toContain('checkout');
        for (const signature of ALL.filter((entry) => entry !== 'POST /checkout'))
            expect(chainOf(router, signature)).not.toContain('checkout');
    });

    // Before the permission, a refused caller would spend it; after the idempotency ledger, a
    // replayed request would escape it, and a loop of retries is the thing being bounded.
    it('spends after the permission check and before the idempotency ledger', () => {
        const chain = chainOf(router, 'POST /checkout');

        expect(chain.indexOf('checkout')).toBeGreaterThan(chain.indexOf('requirePermissionGuard'));
        expect(chain.indexOf('checkout')).toBeLessThan(chain.indexOf('idempotencyKey'));
    });
});

describe('cart routes — a merge is a hundred writes in one request', () => {
    it('is idempotent, so a retry after a lost response cannot add the guest cart twice', () => {
        expect(chainOf(router, 'POST /merge')).toContain('idempotencyKey');
    });

    it('spends its own budget before it is replayed, so a replay is not free', () => {
        const chain = chainOf(router, 'POST /merge');

        expect(chain.indexOf('cart-merge')).toBeGreaterThanOrEqual(0);
        expect(chain.indexOf('cart-merge')).toBeLessThan(chain.indexOf('idempotencyKey'));
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
