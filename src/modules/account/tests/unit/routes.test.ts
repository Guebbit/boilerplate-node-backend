/**
 * @module
 * The account route table — where getting the router wrong is an account takeover. Three
 * arrangements are load-bearing and invisible to a type checker: `router.use(noStore)` must cover
 * every route (a past regression let `setCache` override it on `GET /account`); credential routes
 * must carry BOTH rate-limit budgets; token-bearing routes are deliberately public — the token IS
 * the credential.
 */

import { routeSignatures, routerMiddleware, guardsOn, chainOf } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);

import { router } from '@modules/account/routes';

/** Routes whose credential is a token in the URL or a cookie, not an access token. */
const TOKEN_BEARING = [
    'DELETE /delete-confirm',
    'POST /reset-confirm',
    'POST /verify-confirm',
    'POST /email-change-confirm',
    'POST /email-change-undo',
    'GET /refresh',
    'POST /logout'
];

/**
 * Routes that must carry all three `credentialLimiters` budgets. `POST /signup` and `POST /reset`
 * are deliberately NOT here — see `account routes — signup and reset rate limiting` below for why
 * they carry `signupLimiters`/`resetRequestLimiters` instead.
 */
const RATE_LIMITED = [
    'POST /login',
    'POST /reset-confirm',
    'POST /password',
    'POST /reauth',
    'POST /verify-request',
    'POST /pending-email/resend',
    'POST /verify-confirm',
    'POST /email-change-confirm',
    'POST /email-change-undo',
    'POST /login/2fa',
    'POST /login/2fa/send',
    'GET /oauth/:provider',
    'GET /oauth/:provider/callback'
];

/** Routes that act on the caller's own account and therefore demand a live session. */
const AUTHENTICATED = [
    'GET /',
    'PUT /',
    'PATCH /',
    'DELETE /',
    'POST /password',
    'POST /reauth',
    'GET /reauth',
    'POST /reauth/methods/:method/send',
    'POST /logout-all',
    'GET /sessions',
    'DELETE /sessions/:sessionId',
    'POST /verify-request',
    'POST /pending-email/resend',
    'POST /export',
    'GET /export/:id',
    'GET /2fa',
    'DELETE /2fa',
    'POST /2fa/methods/:method/setup',
    'POST /2fa/methods/:method/send',
    'POST /2fa/methods/:method/confirm',
    'DELETE /2fa/methods/:method',
    'POST /2fa/backup-codes'
];

describe('account routes — what is mounted', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /',
            'PUT /',
            'PATCH /',
            'DELETE /pending-email',
            'POST /pending-email/resend',
            'DELETE /',
            'DELETE /delete-confirm',
            'POST /login',
            'POST /signup',
            'POST /reset',
            'POST /reset-confirm',
            'POST /password',
            'POST /password/check',
            'GET /reauth',
            'POST /reauth',
            'POST /reauth/methods/:method/send',
            'GET /abilities',
            'GET /refresh',
            'POST /logout',
            'POST /logout-all',
            'GET /sessions',
            'DELETE /sessions/:sessionId',
            'POST /verify-request',
            'POST /verify-confirm',
            'POST /email-change-confirm',
            'POST /email-change-undo',
            'POST /export',
            'GET /export/:id',
            'POST /login/2fa/send',
            'POST /login/2fa',
            'GET /2fa',
            'DELETE /2fa',
            'POST /2fa/methods/:method/setup',
            'POST /2fa/methods/:method/send',
            'POST /2fa/methods/:method/confirm',
            'DELETE /2fa/methods/:method',
            'POST /2fa/backup-codes',
            'GET /oauth/providers',
            'GET /oauth/:provider',
            'GET /oauth/:provider/callback'
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

    it('keys no route at all: what you may do to your own record follows from being signed in', () => {
        // The one exception used to be `DELETE /tokens/expired`, an operational lever across every
        // account. That sweep is a nightly job now (`reap:expired-tokens`), not a route.
        const keyed = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('requirePermissionGuard')
        );

        expect(keyed).toEqual([]);
    });

    it('mounts no route that sweeps tokens across accounts', () => {
        expect(routeSignatures(router)).not.toContain('DELETE /tokens/expired');
    });
});

describe('account routes — credential rate limiting', () => {
    it.each(RATE_LIMITED)('%s carries ALL THREE credential budgets', (signature) => {
        const limiters = chainOf(router, signature).filter((entry) =>
            entry.startsWith('credentials-')
        );

        // Identity, address AND address-block: each is keyed differently and defends an attack
        // the other two miss. Any one missing reads as protected and is not.
        expect(limiters).toEqual([
            'credentials-identity',
            'credentials-address',
            'credentials-block'
        ]);
    });

    it('authenticates before rate-limiting, so the identity budget is keyed on the account', () => {
        // On `POST /password`, `/reauth`, `/verify-request` and `/pending-email/resend` the body names no account, so the
        // identity limiter reads the session's. Reversed, it would fall back to the address block.
        for (const signature of [
            'POST /password',
            'POST /reauth',
            'POST /verify-request',
            'POST /pending-email/resend'
        ]) {
            const chain = chainOf(router, signature);

            expect(chain.indexOf('isAuth')).toBeLessThan(chain.indexOf('credentials-identity'));
        }
    });

    it('leaves the non-credential routes unbudgeted', () => {
        // The global brake covers these. A per-route credential budget on, say, the address book
        // would spend a login allowance on ordinary browsing.
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                !RATE_LIMITED.includes(signature) &&
                chainOf(router, signature).some((entry) => entry.startsWith('credentials-'))
        );

        expect(unexpected).toEqual([]);
    });
});

describe('account routes — signup and reset rate limiting', () => {
    /**
     * `credentialLimiters`' `skipSuccessfulRequests` spends nothing on the 201/200 these two
     * routes answer with on their OWN abuse (a Sybil signup, a mail-bombing reset request) — see
     * `signupLimiters`'/`resetRequestLimiters`' own docs in `rate-limits.ts`. Each carries its own
     * three-dimension budget instead, and neither may carry `credentialLimiters` at all.
     */
    it.each([
        ['POST /signup', ['signup-identity', 'signup-address', 'signup-block']],
        ['POST /reset', ['reset-identity', 'reset-address', 'reset-block']]
    ])('%s carries ALL THREE budgets, and no credentialLimiters', (signature, labels) => {
        const chain = chainOf(router, signature);
        const [prefix] = labels[0].split('-', 1);

        expect(chain.filter((entry) => entry.startsWith(`${prefix}-`))).toEqual(labels);
        expect(chain.some((entry) => entry.startsWith('credentials-'))).toBe(false);
    });
});

describe('account routes — the per-mailbox mail budget', () => {
    // The mail goes to whatever address the BODY names, so the budget on that mailbox is what
    // bounds the victim; it runs after the caller's own budgets and before the challenge gate.
    it.each([
        ['POST /signup', 'signup-block'],
        ['POST /reset', 'reset-block']
    ])(
        '%s charges the named mailbox, after its own budgets and before the gate',
        (signature, lastLabel) => {
            const chain = chainOf(router, signature);

            expect(chain).toContain('mailRecipientLimiter');
            expect(chain.indexOf('mailRecipientLimiter')).toBeGreaterThan(chain.indexOf(lastLabel));
            expect(chain.indexOf('mailRecipientLimiter')).toBeLessThan(
                chain.indexOf('humanChallengeGate')
            );
        }
    );

    it('mounts it on no other route (the services charge the recipients they choose)', () => {
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'POST /signup' &&
                signature !== 'POST /reset' &&
                chainOf(router, signature).includes('mailRecipientLimiter')
        );

        expect(unexpected).toEqual([]);
    });
});

describe('account routes — human-challenge gate (rung 3)', () => {
    it.each([
        ['POST /signup', 'signup-block'],
        ['POST /reset', 'reset-block']
    ])('%s carries humanChallengeGate, after its own rate-limit budget', (signature, lastLabel) => {
        const chain = chainOf(router, signature);

        expect(chain).toContain('humanChallengeGate');
        // A spent budget should not reach the gate at all — see rate-limits.ts's own reasoning
        // for mounting a budget before the cost it exists to avoid.
        expect(chain.indexOf('humanChallengeGate')).toBeGreaterThan(chain.indexOf(lastLabel));
    });

    it('mounts the gate on no other route', () => {
        const unexpected = routeSignatures(router).filter(
            (signature) =>
                signature !== 'POST /signup' &&
                signature !== 'POST /reset' &&
                chainOf(router, signature).includes('humanChallengeGate')
        );

        expect(unexpected).toEqual([]);
    });
});

describe('account routes — uploads', () => {
    it.each(['PUT /', 'PATCH /'])(
        '%s accepts the imageUpload field and validates what arrives',
        (signature) => {
            const chain = chainOf(router, signature);

            expect(chain).toContain('upload.image');
            expect(chain).toContain('validateUploadedImages');
            expect(chain).toContain('quarantineUploadedImages');
        }
    );

    it('POST /signup mounts no upload middleware: a stranger writes nothing to the store', () => {
        const chain = chainOf(router, 'POST /signup');

        expect(chain).not.toContain('upload.image');
        expect(chain).not.toContain('quarantineUploadedImages');
    });

    it('caches nothing anywhere', () => {
        // The counterpart to `noStore`: not one route in this module may be stored, so not one
        // may mount `setCache`. This is the assertion that would have caught the regression the
        // header describes, at the router rather than at the header.
        const cached = routeSignatures(router).filter((signature) =>
            chainOf(router, signature).some((entry) => entry.startsWith('setCache'))
        );

        expect(cached).toEqual([]);
    });
});
