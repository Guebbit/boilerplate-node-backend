/**
 * The locales route table.
 *
 * This module makes two deliberate choices that look like mistakes, and both are asserted here so
 * that "fixing" either one fails loudly:
 *
 *   1. THE READS ARE PUBLIC. A client that has just failed to reach the API is exactly who needs a
 *      dictionary, so requiring a token would withhold the copy in the one case it exists for.
 *      There is nothing to protect — it is text written to be published.
 *   2. EVERY ADMIN ROUTE SPELLS ITS OWN GUARD. The public reads must be declared first (Express
 *      takes the first match, and `/tenants` would otherwise be read as a language code), so a
 *      single `router.use` gate could only sit mid-file, guarding by line number. Spelled per
 *      mount, a route carries its own policy and a new one cannot inherit the wrong half.
 *
 * The second choice is what makes this test worth its length: with no router-level gate, "is this
 * route admin-only" is a question about that route's own chain, and there are thirteen of them.
 */
import { routeTable, routeSignatures, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);

import { router } from '@modules/locales/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

/** The four reads any visitor may make. */
const PUBLIC = ['GET /', 'GET /tenants', 'GET /:locale/messages', 'GET /:locale'];

/** Everything that administers the dynamic tier, including the screen the writes are made from. */
const ADMIN = [
    'POST /',
    'PUT /:locale',
    'DELETE /:locale',
    'GET /:locale/entries',
    'POST /:locale/entries',
    'PUT /:locale/entries',
    'PATCH /:locale/entries',
    'PUT /:locale/entries/:entryId',
    'DELETE /:locale/entries/:entryId'
];

describe('locale routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([...PUBLIC, ...ADMIN]);
    });

    it('declares /tenants before /:locale, so it is reachable at all', () => {
        const paths = routeTable(router).map(({ path }) => path);

        // Both are one segment and Express takes the first match: reversed, `GET /locales/tenants`
        // becomes a dictionary lookup for a language called "tenants" and 404s.
        expect(paths.indexOf('/tenants')).toBeLessThan(paths.indexOf('/:locale'));
    });
});

describe('locale routes — authorization', () => {
    it.each(PUBLIC)('%s answers without a token', (signature) => {
        const guards = guardsOn(router, signature);

        // The documented decision. A guard here makes the copy unavailable to the clients that
        // most need it — see this file's header, and the router's own.
        expect(guards).not.toContain('isAuth');
        expect(guards).not.toContain('isAdmin');
    });

    it('reads the caller on the manifest, without demanding one', () => {
        // `GET /` is the one public read that takes `getAuth`: an admin's manifest also lists the
        // inactive languages a visitor is not offered. Dropping it silently narrows the admin
        // view; adding `isAuth` beside it would break the anonymous case.
        expect(guardsOn(router, 'GET /')).toContain('getAuth');
        expect(guardsOn(router, 'GET /')).not.toContain('isAuth');
    });

    it.each(ADMIN)('%s names all three guards itself', (signature) => {
        const guards = guardsOn(router, signature);

        expect(guards).toContain('getAuth');
        expect(guards).toContain('isAuth');
        expect(guards).toContain('isAdmin');
        expect(guards.indexOf('getAuth')).toBeLessThan(guards.indexOf('isAuth'));
        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('isAdmin'));
    });

    it('has no route that is neither a documented public read nor fully guarded', () => {
        // The sweep that catches a route added later: with no router-level gate, a new mount is
        // unguarded by default, which is the failure direction this module trades away for the
        // per-route clarity it needs.
        const ungoverned = routeSignatures(router).filter(
            (signature) =>
                !PUBLIC.includes(signature) && !guardsOn(router, signature).includes('isAdmin')
        );

        expect(ungoverned).toEqual([]);
    });
});

describe('locale routes — caching', () => {
    it.each(PUBLIC)('%s uses the one shared public cache', (signature) => {
        const entry = chainOf(signature).find((each) => each.startsWith('setCache'));

        expect(entry).toContain('setCache(3600');
        expect(entry).toContain('tags=[locales]');
    });

    it('tells browsers to revalidate, so a translator sees their own save', () => {
        // The failure this prevents: an edit clears Redis but cannot reach the copy already in
        // the editor's browser, so they reload and see the old string for up to an hour. That
        // reads as "saving is broken" to the one audience with no other way to tell.
        for (const signature of PUBLIC)
            expect(chainOf(signature).find((each) => each.startsWith('setCache'))).toContain(
                'browserRevalidate=true'
            );
    });

    it('leaves the editing screen uncached', () => {
        // `GET /:locale/entries` feeds the screen the writes are made from; a cached copy there
        // shows an editor the state before their own last save.
        expect(chainOf('GET /:locale/entries').some((each) => each.startsWith('setCache'))).toBe(
            false
        );
    });

    it.each(ADMIN.filter((signature) => signature !== 'GET /:locale/entries'))(
        '%s invalidates the locales tag it just changed',
        (signature) => {
            // Every write changes what every visitor reads, and the tag reaches shared Redis, so
            // one call covers every app instance.
            expect(chainOf(signature)).toContain('invalidateCache([locales])');
        }
    );
});
