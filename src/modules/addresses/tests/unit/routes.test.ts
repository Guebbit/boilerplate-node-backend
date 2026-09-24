/**
 * @module
 * The addresses route table — this router shares the `/account` prefix with `account`'s own
 * router (`@modules/account/routes`), so `getAuth`/`noStore` must cover it exactly the same way,
 * and every route must demand a live session: the whole module is first-person, nothing here is
 * ever public or admin-only.
 */

import { routeSignatures, routerMiddleware, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);

import { router } from '@modules/addresses/routes';

describe('addresses routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /addresses',
            'POST /addresses',
            'PUT /addresses/:addressId',
            'DELETE /addresses/:addressId'
        ]);
    });

    it('reads the caller and forbids storing the answer, for the whole router', () => {
        expect(routerMiddleware(router)).toEqual(['getAuth', 'noStore']);
    });

    it.each(routeSignatures(router))('%s is marked no-store', (signature) => {
        // The address book is identity-adjacent data — same reasoning as account's own profile
        // route, and the same regression shape: a route mounted above `router.use(noStore)` would
        // be silently storable by a shared cache or a browser.
        expect(guardsOn(router, signature)).toContain('noStore');
    });
});

describe('addresses routes — authorization', () => {
    it.each(routeSignatures(router))('%s requires a live session', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('carries no permission key — every route is the caller acting on their own rows', () => {
        const keyed = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('requirePermissionGuard')
        );

        expect(keyed).toEqual([]);
    });
});

describe('addresses routes — no unexpected middleware', () => {
    it('carries no credential rate limiting — the global brake covers this module', () => {
        const limited = routeSignatures(router).filter((signature) =>
            chainOf(router, signature).some((entry) => entry.startsWith('credentials-'))
        );

        expect(limited).toEqual([]);
    });

    it('caches nothing anywhere', () => {
        const cached = routeSignatures(router).filter((signature) =>
            chainOf(router, signature).some((entry) => entry.startsWith('setCache'))
        );

        expect(cached).toEqual([]);
    });
});
