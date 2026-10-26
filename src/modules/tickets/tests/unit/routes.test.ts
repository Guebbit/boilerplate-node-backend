/**
 * @module
 * The tickets route table. `routes.ts` mounts ONE public route (the visitor contact form),
 * then `router.use(getAuth, isAuthOrCredential)` and a `requirePermission('tickets.*')` per
 * route — everything below the mount is keyed, purely by position, and nothing looks wrong
 * either way if that is gotten wrong. Assertions here are positional for that reason (see
 * `effectiveRouteTable` in `tests/support/routes.ts`); per-route middleware alone would pass
 * whatever happened.
 */

import { routeSignatures, guardsOn, identityGuardIndex, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/tickets/routes';

describe('tickets routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'POST /',
            'POST /search',
            'GET /',
            'GET /summary',
            'GET /:id',
            'POST /:id/resolve',
            'POST /:id/mark-spam',
            'POST /:id/reopen',
            'PUT /:id/assignee',
            'DELETE /:id/assignee',
            'POST /:id/notes',
            'DELETE /:id'
        ]);
    });
});

describe('tickets routes — the positional guard', () => {
    it('leaves POST / public, above the gate', () => {
        const guards = guardsOn(router, 'POST /');

        // The whole reason the module exists for a visitor. A guard reaching this route is an
        // outage of the contact form, not a hardening.
        expect(identityGuardIndex(guards)).toBe(-1);
        expect(guards).not.toContain('requirePermissionGuard');
    });

    it('recognises a signed-in sender on POST / without requiring one', () => {
        // `getAuth` resolves the session when there is one; it is not an identity guard, so an
        // anonymous or expired-token post still goes through as anonymous.
        const chain = chainOf(router, 'POST /');

        expect(chain).toContain('getAuth');
        expect(chain.indexOf('getAuth')).toBeLessThan(chain.indexOf('postTicket'));
    });

    it.each([
        'POST /search',
        'GET /',
        'GET /summary',
        'GET /:id',
        'POST /:id/resolve',
        'POST /:id/mark-spam',
        'POST /:id/reopen',
        'PUT /:id/assignee',
        'DELETE /:id/assignee',
        'POST /:id/notes',
        'DELETE /:id'
    ])('%s sits below the gate and is keyed', (signature) => {
        const guards = guardsOn(router, signature);

        expect(guards).toContain('getAuth');
        expect(identityGuardIndex(guards)).toBeGreaterThanOrEqual(0);
        expect(guards).toContain('requirePermissionGuard');
    });

    it('keeps the contact route first, so the gate cannot be moved above it', () => {
        // If `router.use` were mounted at the top instead, this ordering assertion would still
        // pass — but the guard assertion above would fail, which is the pair that pins it.
        expect(routeSignatures(router)[0]).toBe('POST /');
    });

    it('guards every route that reads what visitors submitted', () => {
        // Stated as a sweep rather than a list: a route added below the gate is covered
        // automatically, and one added above it fails here.
        const readsSubmissions = routeSignatures(router).filter(
            (signature) => signature !== 'POST /'
        );

        for (const signature of readsSubmissions)
            expect(guardsOn(router, signature)).toContain('requirePermissionGuard');
    });
});

describe('tickets routes — caching', () => {
    // One admin's queue, never a shared Redis answer — RFC 9111 §3.5. `privateNoCache` lets the
    // BROWSER keep its own copy of the GET, revalidated every time.
    it('GET / is never Redis-cached, only privateNoCache', () => {
        const chain = chainOf(router, 'GET /');

        expect(chain).toContain('privateNoCache');
        expect(chain.some((entry) => entry.startsWith('setCache'))).toBe(false);
    });

    it('POST /search answers no-store, like every POST', () => {
        const chain = chainOf(router, 'POST /search');

        expect(chain).toContain('noStore');
        expect(chain.some((entry) => entry.startsWith('setCache'))).toBe(false);
    });
});

describe('tickets routes — submission rate limiting', () => {
    it('rate-limits the contact form before it can write anything', () => {
        // The whole point is that a spent budget costs no database write — see
        // `contactLimiters`' own docs for why this is a DIFFERENT set of limiters from
        // `credentialLimiters`. All THREE dimensions — address, identity, address-block.
        const chain = chainOf(router, 'POST /');
        const limiters = chain.filter((entry) => entry.startsWith('submission'));

        expect(limiters).toEqual(['submissions', 'submission-identity', 'submission-block']);
        expect(chain.indexOf('submissions')).toBeLessThan(chain.indexOf('postTicket'));
    });

    it('leaves every other route unbudgeted by the contact-form limiters', () => {
        // Only the public write needs this budget — the admin routes sit behind their own gate.
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'POST /' &&
                chainOf(router, signature).some((entry) => entry.startsWith('submission'))
        );

        expect(unexpected).toEqual([]);
    });
});

describe('tickets routes — human-challenge gate (rung 3)', () => {
    it('carries humanChallengeGate on POST /, after contactLimiters', () => {
        const chain = chainOf(router, 'POST /');

        expect(chain).toContain('humanChallengeGate');
        expect(chain.indexOf('humanChallengeGate')).toBeGreaterThan(
            chain.indexOf('submission-block')
        );
    });

    it('mounts the gate on no other route', () => {
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'POST /' && chainOf(router, signature).includes('humanChallengeGate')
        );

        expect(unexpected).toEqual([]);
    });
});
