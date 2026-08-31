/**
 * The user-administration route table.
 *
 * Every route here is admin-only, and it is admin-only by ONE line — `router.use(getAuth, isAuth,
 * isAdmin)` at the top. That is the strongest arrangement available (a route added later inherits
 * the guard rather than having to remember it), and it is also the one whose failure is widest: if
 * that single `use` loses `isAdmin`, the entire user directory — every email address in the
 * system — becomes readable by any logged-in customer, with no other line in the file changing.
 *
 * So the guard is asserted per endpoint rather than once. A single `expect(routerMiddleware(...))`
 * would state the same fact, but it would keep passing if a route were later mounted above the
 * `use`, which is exactly the mistake `feedback` and `locales` are shaped to avoid.
 */
import { routeTable, routeSignatures, guardsOn, optionsOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/adapters/storage', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/users/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

const ALL = [
    'POST /search',
    'GET /',
    'POST /',
    'PUT /',
    'DELETE /',
    'GET /:id',
    'PUT /:id',
    'DELETE /:id',
    'DELETE /:id/hard'
];

describe('user routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual(ALL);
    });

    it('declares /search before /:id, so it is reachable at all', () => {
        const paths = routeTable(router).map(({ path }) => path);

        expect(paths.indexOf('/search')).toBeLessThan(paths.indexOf('/:id'));
    });
});

describe('user routes — authorization', () => {
    it.each(ALL)('%s is reachable only by an authenticated admin', (signature) => {
        const guards = guardsOn(router, signature);

        // All three, in order. `getAuth` populates the context, `isAuth` demands one, `isAdmin`
        // reads the role off it — `isAdmin` before `isAuth` would read a role from nothing.
        expect(guards).toContain('getAuth');
        expect(guards).toContain('isAuth');
        expect(guards).toContain('isAdmin');
        expect(guards.indexOf('getAuth')).toBeLessThan(guards.indexOf('isAuth'));
        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('isAdmin'));
    });

    it('has no public endpoint at all', () => {
        // The directory is admin-only in full. This is the assertion that fails if someone mounts
        // a "harmless" public read above the gate.
        const unguarded = routeSignatures(router).filter(
            (signature) => !guardsOn(router, signature).includes('isAdmin')
        );

        expect(unguarded).toEqual([]);
    });
});

describe('user routes — caching and uploads', () => {
    it('caches the two listings under one shared key', () => {
        const listing = chainOf('GET /').find((entry) => entry.startsWith('setCache'));
        const search = chainOf('POST /search').find((entry) => entry.startsWith('setCache'));

        expect(listing).toBe(search);
        expect(listing).toContain('setCache(3600');
        expect(optionsOf(chainOf('GET /'), 'setCache')).toMatchObject({
            tags: ['users'],
            keyAs: 'users:search'
        });
        expect(optionsOf(chainOf('GET /'), 'setCache').keyParameters).not.toHaveLength(0);
    });

    it('caches the single read under the users tag', () => {
        expect(optionsOf(chainOf('GET /:id'), 'setCache')).toMatchObject({ tags: ['users'] });
    });

    it.each(['POST /', 'PUT /', 'DELETE /', 'PUT /:id', 'DELETE /:id', 'DELETE /:id/hard'])(
        '%s clears both the users and account tags',
        (signature) => {
            // Both, because the same row is served by two modules: `/users/:id` to an admin and
            // `/account` to its owner. Clearing one leaves the other serving the old profile.
            expect(chainOf(signature)).toContain('invalidateCache([users|account])');
        }
    );

    it.each(['POST /', 'PUT /', 'PUT /:id'])(
        '%s accepts the imageUpload field and validates it',
        (signature) => {
            const chain = chainOf(signature);

            expect(chain).toContain('upload.single(imageUpload)');
            expect(chain).toContain('validateUploadedImages');
            expect(chain).toContain('quarantineUploadedImages');
        }
    );

    it('reaches the hard delete only through the flag route', () => {
        expect(chainOf('DELETE /:id/hard')).toContain('routeFlag(hardDelete)');
        expect(chainOf('DELETE /:id')).not.toContain('routeFlag(hardDelete)');
        expect(chainOf('DELETE /')).not.toContain('routeFlag(hardDelete)');
    });
});
