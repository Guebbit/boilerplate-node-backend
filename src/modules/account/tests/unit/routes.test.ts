/**
 * @module
 * The account route table — where getting the router wrong is an account takeover. Three
 * arrangements are load-bearing and invisible to a type checker: `router.use(noStore)` must cover
 * every route (a past regression let `setCache` override it on `GET /account`); credential routes
 * must carry BOTH rate-limit budgets; token-bearing routes are deliberately public — the token IS
 * the credential.
 */

import { routeTable, routeSignatures, routerMiddleware, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);
jest.mock('@infrastructure/adapters/storage', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/account/routes';

/** The middleware chain mounted on one endpoint, by signature. */
const chainOf = (signature: string) =>
    routeTable(router).find(({ method, path }) => `${method} ${path}` === signature)!.chain;

/** Routes whose credential is a token in the URL or a cookie, not an access token. */
const TOKEN_BEARING = [
    'DELETE /delete-confirm',
    'POST /reset-confirm',
    'POST /verify-confirm',
    'GET /refresh',
    'POST /logout'
];

/** Routes that must carry both credential budgets. */
const RATE_LIMITED = [
    'POST /login',
    'POST /signup',
    'POST /reset',
    'POST /reset-confirm',
    'POST /password',
    'POST /reauth',
    'POST /verify-request',
    'POST /verify-confirm',
    'POST /login/2fa'
];

/** Routes that act on the caller's own account and therefore demand a live session. */
const AUTHENTICATED = [
    'GET /',
    'PUT /',
    'DELETE /',
    'POST /password',
    'POST /reauth',
    'POST /logout-all',
    'GET /sessions',
    'DELETE /sessions/:sessionId',
    'GET /addresses',
    'POST /addresses',
    'PUT /addresses/:addressId',
    'DELETE /addresses/:addressId',
    'POST /verify-request',
    'DELETE /tokens/expired',
    'POST /export',
    'POST /2fa/setup',
    'POST /2fa/confirm',
    'DELETE /2fa'
];

describe('account routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'PUT /',
            'DELETE /',
            'DELETE /delete-confirm',
            'POST /login',
            'POST /signup',
            'POST /reset',
            'POST /reset-confirm',
            'POST /password',
            'POST /reauth',
            'GET /refresh',
            'POST /logout',
            'POST /logout-all',
            'GET /sessions',
            'DELETE /sessions/:sessionId',
            'GET /addresses',
            'POST /addresses',
            'PUT /addresses/:addressId',
            'DELETE /addresses/:addressId',
            'POST /verify-request',
            'POST /verify-confirm',
            'DELETE /tokens/expired',
            'POST /export',
            'POST /login/2fa',
            'POST /2fa/setup',
            'POST /2fa/confirm',
            'DELETE /2fa'
        ]);
    });

    it('reads the caller and forbids storing the answer, for the whole router', () => {
        // Order matters as much as presence: `noStore` after `getAuth` is fine, but both must be
        // above every route, which `guardsOn` checks per endpoint below.
        expect(routerMiddleware(router)).toEqual(['getAuth', 'noStore']);
    });

    it.each(routeSignatures(router))('%s is marked no-store', (signature) => {
        // The one that regressed before: a profile is the caller's identity and must never be
        // stored by a shared cache or a browser. Asserted per route so a route mounted above the
        // `use` — which would be silently storable — fails here.
        expect(guardsOn(router, signature)).toContain('noStore');
    });
});

describe('account routes — authorization', () => {
    it.each(AUTHENTICATED)('%s requires a live session', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it.each(TOKEN_BEARING)('%s stays public, because the token is the credential', (signature) => {
        // Deliberate. A caller completing a password reset has no access token by definition; a
        // caller logging out is destroying the one they have. `isAuth` here breaks the flow.
        expect(guardsOn(router, signature)).not.toContain('isAuth');
    });

    it.each(['POST /login', 'POST /signup', 'POST /reset'])(
        '%s stays public, because it is how a session begins',
        (signature) => {
            expect(guardsOn(router, signature)).not.toContain('isAuth');
        }
    );

    it('admin-guards the token sweep, and nothing else', () => {
        // `DELETE /account/tokens/expired` is maintenance across every account, not self-service.
        // It is the only admin route in a module that is otherwise entirely first-person.
        const adminGuarded = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('isAdmin')
        );

        expect(adminGuarded).toEqual(['DELETE /tokens/expired']);
    });

    it('demands a session before checking the role on the sweep', () => {
        const guards = guardsOn(router, 'DELETE /tokens/expired');

        expect(guards.indexOf('isAuth')).toBeLessThan(guards.indexOf('isAdmin'));
    });
});

describe('account routes — credential rate limiting', () => {
    it.each(RATE_LIMITED)('%s carries BOTH credential budgets', (signature) => {
        const limiters = chainOf(signature).filter((entry) =>
            entry.startsWith('credentialLimiters')
        );

        // Both, not one: the budgets are keyed differently — identity and address — and each
        // defends an attack the other misses. Half the pair reads as protected and is not.
        expect(limiters).toEqual(['credentialLimiters[0]', 'credentialLimiters[1]']);
    });

    it('rate-limits before authenticating, so a spent budget costs no lookup', () => {
        // On `POST /password`, `/reauth` and `/verify-request` the limiters precede `isAuth`.
        // Reversed, a flood of unauthenticated requests would each do the session work before
        // being refused.
        for (const signature of ['POST /password', 'POST /reauth', 'POST /verify-request']) {
            const chain = chainOf(signature);

            expect(chain.indexOf('credentialLimiters[0]')).toBeLessThan(chain.indexOf('isAuth'));
        }
    });

    it('leaves the non-credential routes unbudgeted', () => {
        // The global brake covers these. A per-route credential budget on, say, the address book
        // would spend a login allowance on ordinary browsing.
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                !RATE_LIMITED.includes(signature) &&
                chainOf(signature).some((entry) => entry.startsWith('credentialLimiters'))
        );

        expect(unexpected).toEqual([]);
    });
});

describe('account routes — cache invalidation and uploads', () => {
    it.each([
        'PUT /',
        'DELETE /delete-confirm',
        'POST /signup',
        'POST /reset-confirm',
        'POST /verify-confirm',
        'DELETE /tokens/expired'
    ])('%s clears both the users and account tags', (signature) => {
        // The same row is served as `/account` to its owner and `/users/:id` to an admin.
        // Clearing one tag leaves the other serving the profile as it was.
        expect(chainOf(signature)).toContain('invalidateCache([users|account])');
    });

    it('clears only the account tag when revoking every session', () => {
        // Sessions are not part of the admin user listing, so widening this would evict the whole
        // user directory on every logout-all.
        expect(chainOf('POST /logout-all')).toContain('invalidateCache([account])');
    });

    it.each(['PUT /', 'POST /signup'])(
        '%s accepts the imageUpload field and validates what arrives',
        (signature) => {
            const chain = chainOf(signature);

            expect(chain).toContain('upload.single(imageUpload)');
            expect(chain).toContain('validateUploadedImages');
            expect(chain).toContain('quarantineUploadedImages');
        }
    );

    it('caches nothing anywhere', () => {
        // The counterpart to `noStore`: not one route in this module may be stored, so not one
        // may mount `setCache`. This is the assertion that would have caught the regression the
        // header describes, at the router rather than at the header.
        const cached = routeSignatures(router).filter((signature) =>
            chainOf(signature).some((entry) => entry.startsWith('setCache'))
        );

        expect(cached).toEqual([]);
    });
});
