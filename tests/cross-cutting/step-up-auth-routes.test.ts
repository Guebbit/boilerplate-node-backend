/**
 * One app-wide guard: every money or identity route below carries
 * `requireFreshAuth`/`requireFreshAuthWhen`, at the tier assigned to it — critical or
 * sensitive — stated once so a future money or identity route inherits the property instead of
 * needing someone to remember it.
 *
 * `STEP_UP_ROUTES` is checked in both directions: every entry must still be a mounted route
 * (no stale table), and every mounted route actually carrying the guard must be IN the table (no
 * silent tier change, and no route quietly gated without anyone documenting why here).
 */
import type { Router } from 'express';
import { guardsOn, routeSignatures } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);
jest.mock('@infrastructure/adapters/storage', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@kernel/middlewares/authorizations', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').authGuardsMock()
);

import { REAUTH_TIME_CRITICAL, REAUTH_TIME_SENSITIVE } from '@kernel/middlewares/authorizations';
import { router as accountRouter } from '@modules/account/routes';
import { router as cartRouter } from '@modules/cart/routes';
import { router as paymentsRouter } from '@modules/payments/routes';

/** The three routers with money or identity routes, keyed the same way `STEP_UP_ROUTES` is. */
const ROUTERS: Record<string, Router> = {
    account: accountRouter,
    cart: cartRouter,
    payments: paymentsRouter
};

/**
 * Every money/identity route, keyed `${module} ${METHOD} ${path}`, mapped to the
 * exact guard label {@link authGuardsMock} records for it — unconditional at its tier, or
 * conditional (`requireFreshAuthWhen`) for the one route where freshness depends on what changed.
 */
const STEP_UP_ROUTES: Record<string, string> = {
    'cart POST /checkout': `requireFreshAuth(${REAUTH_TIME_CRITICAL})`,
    'payments POST /intent': `requireFreshAuth(${REAUTH_TIME_CRITICAL})`,
    'payments POST /:id/confirm': `requireFreshAuth(${REAUTH_TIME_CRITICAL})`,
    'payments POST /order/:orderId/refund': `requireFreshAuth(${REAUTH_TIME_CRITICAL})`,
    'account DELETE /': `requireFreshAuth(${REAUTH_TIME_CRITICAL})`,
    'account PUT /': `requireFreshAuthWhen(${REAUTH_TIME_SENSITIVE})`,
    'account POST /logout-all': `requireFreshAuth(${REAUTH_TIME_SENSITIVE})`,
    'account DELETE /sessions/:sessionId': `requireFreshAuth(${REAUTH_TIME_SENSITIVE})`,
    // The data export adopts this same guard in place of a bespoke password check — see the
    // route's own comment in `account/routes.ts`.
    'account POST /export': `requireFreshAuth(${REAUTH_TIME_SENSITIVE})`
};

/** Every step-up label actually mounted on a router, keyed the same way as {@link STEP_UP_ROUTES}. */
const mountedStepUps = (): Record<string, string> => {
    const found: Record<string, string> = {};

    for (const [moduleName, router] of Object.entries(ROUTERS))
        for (const signature of routeSignatures(router)) {
            const stepUp = guardsOn(router, signature).find(
                (entry) =>
                    entry.startsWith('requireFreshAuth(') ||
                    entry.startsWith('requireFreshAuthWhen(')
            );
            if (stepUp !== undefined) found[`${moduleName} ${signature}`] = stepUp;
        }

    return found;
};

describe('step-up auth is where the plan says it is', () => {
    it('has no stale entry — every listed route is still mounted', () => {
        const mounted = new Set(
            Object.entries(ROUTERS).flatMap(([moduleName, router]) =>
                routeSignatures(router).map((signature) => `${moduleName} ${signature}`)
            )
        );

        expect(Object.keys(STEP_UP_ROUTES).filter((key) => !mounted.has(key))).toEqual([]);
    });

    it.each(Object.entries(STEP_UP_ROUTES))('%s carries %s', (key, expectedLabel) => {
        const [moduleName, ...rest] = key.split(' ');
        const signature = rest.join(' ');

        expect(guardsOn(ROUTERS[moduleName], signature)).toContain(expectedLabel);
    });

    it('mounts the guard on exactly this table — nowhere else, at no other tier', () => {
        expect(mountedStepUps()).toEqual(STEP_UP_ROUTES);
    });

    it('never confuses the two tiers', () => {
        // Guards the table itself: a critical route hand-typed with the sensitive constant (or
        // vice versa) would still pass every check above, since both are just numbers to Jest.
        expect(REAUTH_TIME_CRITICAL).toBeLessThan(REAUTH_TIME_SENSITIVE);
    });
});
