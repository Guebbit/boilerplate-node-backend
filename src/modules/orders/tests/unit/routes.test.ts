/**
 * @module
 * The orders route table. The whole router is authenticated at the top (`router.use(getAuth,
 * isAuth)`), with the admin guard applied per route — an `isAdmin` omitted from a write reads as
 * "any authenticated user may do this", easy to get wrong in the unsafe direction. `POST
 * /:id/cancel` is deliberately NOT admin-guarded, since a customer cancelling their own order is
 * the one write they may make; its safety comes from the service's scoped conditional write, not
 * the router.
 */
import { routeTable, routeSignatures, guardsOn, optionsOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);

import { router } from '@modules/orders/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

describe('order routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'POST /search',
            'GET /',
            'POST /',
            'PUT /',
            'DELETE /',
            'POST /:id/cancel',
            'GET /:id/invoice',
            'GET /:id',
            'PUT /:id',
            'DELETE /:id',
            'DELETE /:id/hard'
        ]);
    });

    it('declares /search and the two-segment reads before /:id', () => {
        const paths = routeTable(router).map(({ path }) => path);

        // `/search` genuinely shadows: one segment, same verb family. `/:id/invoice` is two
        // segments so it cannot be shadowed by `/:id` — it is ordered for readability, and
        // asserting it keeps the file's stated convention from decaying silently.
        expect(paths.indexOf('/search')).toBeLessThan(paths.indexOf('/:id'));
        expect(paths.indexOf('/:id/invoice')).toBeLessThan(paths.indexOf('/:id'));
    });
});

describe('order routes — authorization', () => {
    it.each([
        'POST /search',
        'GET /',
        'POST /',
        'PUT /',
        'DELETE /',
        'POST /:id/cancel',
        'GET /:id/invoice',
        'GET /:id',
        'PUT /:id',
        'DELETE /:id',
        'DELETE /:id/hard'
    ])('%s requires a logged-in caller', (signature) => {
        // Router-level, so this asserts the `router.use` really covers every route — including
        // any added later, which is the whole reason it is mounted there rather than per route.
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it.each(['POST /', 'PUT /', 'DELETE /', 'PUT /:id', 'DELETE /:id', 'DELETE /:id/hard'])(
        '%s is admin-only',
        (signature) => {
            expect(guardsOn(router, signature)).toContain('isAdmin');
        }
    );

    it('leaves POST /:id/cancel open to the owner, not just admins', () => {
        // Not an oversight: the customer cancel. Its authorization is the caller scope inside
        // `orderService.cancelById`, covered by `service-scope.test.ts` and `cancel.test.ts`.
        // Adding `isAdmin` here would silently remove the feature.
        expect(guardsOn(router, 'POST /:id/cancel')).not.toContain('isAdmin');
    });

    it.each(['POST /search', 'GET /', 'GET /:id', 'GET /:id/invoice'])(
        '%s is readable by any logged-in caller, scoped in the service',
        (signature) => {
            expect(guardsOn(router, signature)).not.toContain('isAdmin');
        }
    );
});

describe('order routes — caching', () => {
    it('caches the two listings under one shared key', () => {
        const listing = chainOf('GET /').find((entry) => entry.startsWith('setCache'));
        const search = chainOf('POST /search').find((entry) => entry.startsWith('setCache'));

        expect(listing).toBe(search);
        expect(listing).toContain('setCache(3600');
        expect(optionsOf(chainOf('GET /'), 'setCache')).toMatchObject({
            tags: ['orders'],
            keyAs: 'orders:search'
        });
        expect(optionsOf(chainOf('GET /'), 'setCache').keyParameters).not.toHaveLength(0);
    });

    it.each(['GET /:id', 'GET /:id/invoice'])('%s is cached under the orders tag', (signature) => {
        const entry = chainOf(signature).find((each) => each.startsWith('setCache'));

        expect(entry).toContain('setCache(3600');
        expect(optionsOf(chainOf(signature), 'setCache')).toMatchObject({ tags: ['orders'] });
    });

    it('invalidates products too wherever stock moves, and only there', () => {
        // Creating an order and cancelling one both change availability, so both must clear the
        // catalogue. A plain edit or delete does not touch stock — clearing `products` there
        // would be a needless cache stampede, and the asymmetry is deliberate.
        expect(chainOf('POST /')).toContain('invalidateCache([orders|products])');
        expect(chainOf('POST /:id/cancel')).toContain('invalidateCache([orders|products])');

        for (const signature of [
            'PUT /',
            'DELETE /',
            'PUT /:id',
            'DELETE /:id',
            'DELETE /:id/hard'
        ])
            expect(chainOf(signature)).toContain('invalidateCache([orders])');
    });

    it('reaches the hard delete only through the flag route', () => {
        expect(chainOf('DELETE /:id/hard')).toContain('routeFlag(hardDelete)');
        expect(chainOf('DELETE /:id')).not.toContain('routeFlag(hardDelete)');
        expect(chainOf('DELETE /')).not.toContain('routeFlag(hardDelete)');
    });
});
