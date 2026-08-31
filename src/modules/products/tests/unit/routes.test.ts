/**
 * @module
 * The product catalogue's route table.
 *
 * Guards against silent failures that no type checker catches: an admin guard dropped from a
 * write route, a static path like `/search` declared after `/:id` and shadowed, or a cache
 * tag renamed on the writer but not the reader.
 *
 * See `tests/support/routes.ts` for why the middleware factories are replaced with mocks.
 */

import { routeTable, routerMiddleware, routeSignatures, optionsOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/adapters/storage', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/products/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

/** The catalogue's cache tag, stated once so a rename has one place to fail. */
const TAG = 'products';

describe('product routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        // Stated in full rather than asserted one at a time: the point is that nothing ELSE is
        // mounted, which a per-route check cannot say.
        expect(routeSignatures(router)).toEqual([
            'POST /search',
            'GET /',
            'POST /',
            'PUT /',
            'DELETE /',
            'GET /categories',
            'GET /:id',
            'PUT /:id',
            'DELETE /:id',
            'DELETE /:id/hard'
        ]);
    });

    it('declares the static segments before /:id, so they are reachable at all', () => {
        const paths = routeTable(router).map(({ path }) => path);

        // Express matches in mount order: the first `/:id` shadows every later literal segment.
        expect(paths.indexOf('/search')).toBeLessThan(paths.indexOf('/:id'));
        expect(paths.indexOf('/categories')).toBeLessThan(paths.indexOf('/:id'));
    });

    it('runs getAuth for every route, so admins get the wider scope', () => {
        // Router-level, not per-route: an admin reading `GET /:id` sees a soft-deleted product
        // only because this ran. Mounted per-route instead, one omission un-scopes one endpoint.
        expect(routerMiddleware(router)).toContain('getAuth');
    });
});

describe('product routes — authorization', () => {
    /** Everything that changes catalogue state. Reads are deliberately absent. */
    const WRITES = ['POST /', 'PUT /', 'DELETE /', 'PUT /:id', 'DELETE /:id', 'DELETE /:id/hard'];

    it.each(WRITES)('%s requires an authenticated admin', (signature) => {
        const row = routeTable(router).find(
            ({ method, path }) => `${method} ${path}` === signature
        );

        expect(row).toBeDefined();
        // Both, and in this order: `isAdmin` alone would read the role off an absent auth context.
        expect(row!.chain).toContain('isAuth');
        expect(row!.chain).toContain('isAdmin');
        expect(row!.chain.indexOf('isAuth')).toBeLessThan(row!.chain.indexOf('isAdmin'));
    });

    it.each(['POST /search', 'GET /', 'GET /categories', 'GET /:id'])(
        '%s stays public',
        (signature) => {
            const row = routeTable(router).find(
                ({ method, path }) => `${method} ${path}` === signature
            );

            // The catalogue is a storefront: a guard added here is an outage, not a hardening.
            expect(row!.chain).not.toContain('isAuth');
            expect(row!.chain).not.toContain('isAdmin');
        }
    );
});

describe('product routes — caching', () => {
    it('caches the two catalogue listings under one key, keyed by the search parameters', () => {
        // `GET /` and `POST /search` are the same query behind two verbs, so they must share
        // `keyAs` — otherwise the same page is stored twice and invalidated once.
        const listing = chainOf('GET /').find((entry) => entry.startsWith('setCache'));
        const search = chainOf('POST /search').find((entry) => entry.startsWith('setCache'));

        expect(listing).toBe(search);
        expect(listing).toContain('setCache(3600');
        expect(optionsOf(chainOf('GET /'), 'setCache')).toMatchObject({
            tags: [TAG],
            keyAs: `${TAG}:search`
        });
        // A cached listing keyed on nothing serves page 1 to every caller.
        expect(optionsOf(chainOf('GET /'), 'setCache').keyParameters).not.toHaveLength(0);
    });

    it.each(['GET /categories', 'GET /:id'])(
        '%s is cached under the catalogue tag',
        (signature) => {
            const entry = chainOf(signature).find((each) => each.startsWith('setCache'));

            expect(entry).toContain('setCache(3600');
            expect(optionsOf(chainOf(signature), 'setCache')).toMatchObject({ tags: [TAG] });
        }
    );

    it.each(['POST /', 'PUT /', 'DELETE /', 'PUT /:id', 'DELETE /:id', 'DELETE /:id/hard'])(
        '%s invalidates the catalogue tag it just changed',
        (signature) => {
            // The tag has to be the one the readers above set. Asserting the literal rather than
            // a shared constant is deliberate: a rename must fail here, not follow along.
            expect(chainOf(signature)).toContain(`invalidateCache([${TAG}])`);
        }
    );
});

describe('product routes — uploads and flags', () => {
    it.each(['POST /', 'PUT /', 'PUT /:id'])(
        '%s accepts the imageUpload field and validates what arrives',
        (signature) => {
            const chain = chainOf(signature);

            // The field name is a contract with the client: a rename here is a silently ignored
            // upload, since multer drops fields it was not told about.
            expect(chain).toContain('upload.single(imageUpload)');
            // Behind the label, the real chain — a route that accepts a file and never checks it
            // is how a disguised payload reaches storage.
            expect(chain).toContain('validateUploadedImages');
            expect(chain).toContain('quarantineUploadedImages');
        }
    );

    it('reaches the hard delete only through the flag route', () => {
        // `DELETE /:id` soft-deletes; the same handler hard-deletes only with the flag set. If the
        // flag moved onto the plain route, a normal delete would become unrecoverable.
        expect(chainOf('DELETE /:id/hard')).toContain('routeFlag(hardDelete)');
        expect(chainOf('DELETE /:id')).not.toContain('routeFlag(hardDelete)');
        expect(chainOf('DELETE /')).not.toContain('routeFlag(hardDelete)');
    });
});
