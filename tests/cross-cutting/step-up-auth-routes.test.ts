/**
 * One app-wide guard: every money or identity route below carries
 * `requireFreshAuth`/`requireFreshAuthWhen`, at the tier assigned to it — critical or
 * sensitive — stated once so a future money or identity route inherits the property instead of
 * needing someone to remember it.
 *
 * `STEP_UP_ROUTES` is checked in both directions: every entry must still be a mounted route
 * (no stale table), and every mounted route actually carrying the guard must be IN the table (no
 * silent tier change, and no route quietly gated without anyone documenting why here).
 *
 * THE OTHER HALF LIVES ON THE KEYS. A route mounts this guard when freshness is a property of the
 * ROUTE — checking out, changing your own address, ending every session — and those are about the
 * caller's own record, which no permission key names. Where freshness is a property of the ACTION,
 * `shared/authorization-keys.yaml` says so with `stepUp:` and `requirePermission` enforces it:
 * `users.any.delete` and `payments.any.update` are both there, and neither route mounts anything.
 * `tests/unit/kernel/step-up.test.ts` covers that path; the sweep below covers this one.
 */
import type { Router } from 'express';
import { guardsOn, routeSignatures } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@kernel/middlewares/authorizations', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').authGuardsMock()
);

import { router as accountRouter } from '@modules/account/routes';
import { router as cartRouter } from '@modules/cart/routes';
import { router as paymentsRouter } from '@modules/payments/routes';
import { router as deliveryRouter } from '@modules/delivery/routes';
import { router as returnsRouter } from '@modules/returns/routes';
import { router as usersRouter } from '@modules/users/routes';

/** The six routers with money, identity or role routes, keyed the same way `STEP_UP_ROUTES` is. */
const ROUTERS: Record<string, Router> = {
    account: accountRouter,
    cart: cartRouter,
    payments: paymentsRouter,
    delivery: deliveryRouter,
    returns: returnsRouter,
    users: usersRouter
};

/**
 * Every money/identity route, keyed `${module} ${METHOD} ${path}`, mapped to the
 * exact guard label {@link authGuardsMock} records for it — unconditional at its tier, or
 * conditional (`requireFreshAuthWhen`) for the one route where freshness depends on what changed.
 */
const STEP_UP_ROUTES: Record<string, string> = {
    'cart POST /checkout': `requireFreshAuth(critical)`,
    'payments POST /intent': `requireFreshAuth(critical)`,
    'payments POST /:id/confirm': `requireFreshAuth(critical)`,
    // The sync settles money just as the confirm does, from the provider's answer rather than
    // from a method the caller supplied — so it sits at the same tier, not a lower one.
    'payments POST /:id/sync': `requireFreshAuth(critical)`,
    // The first guard recorded is the conditional one: an account with a second factor must also
    // have proved an `otp`. The unconditional critical guard follows it on the same route.
    'account DELETE /': `requireFreshAuthWhen(critical)`,
    // Only for an account with a second factor armed (the otp demand): the plain password change
    // of an account without one is gated by the current password alone, as before.
    'account POST /password': `requireFreshAuthWhen(sensitive)`,
    'account PUT /': `requireFreshAuthWhen(sensitive)`,
    'account PATCH /': `requireFreshAuthWhen(sensitive)`,
    'account POST /logout-all': `requireFreshAuth(sensitive)`,
    // Disconnecting a provider removes a way into the account: an identity change, sensitive tier.
    'account DELETE /oauth/links/:provider': `requireFreshAuth(sensitive)`,
    'account DELETE /sessions/:sessionId': `requireFreshAuth(sensitive)`,
    // The data export adopts this same guard in place of a bespoke password check — see the
    // route's own comment in `account/routes.ts`.
    'account POST /export': `requireFreshAuth(sensitive)`,
    'account GET /export/:id': `requireFreshAuth(sensitive)`,
    // Enrolling, confirming or disabling a second factor is itself a sensitive action —
    // critical tier, same as `DELETE /` and the checkout/payment routes above.
    'account POST /2fa/methods/:method/setup': `requireFreshAuth(critical)`,
    'account POST /2fa/methods/:method/send': `requireFreshAuth(critical)`,
    'account POST /2fa/methods/:method/confirm': `requireFreshAuth(critical)`,
    'account DELETE /2fa/methods/:method': `requireFreshAuth(critical)`,
    'account DELETE /2fa': `requireFreshAuth(critical)`,
    // Regenerating backup codes discards the old set — the same stolen-but-fresh-session risk
    // as disabling a factor.
    'account POST /2fa/backup-codes': `requireFreshAuth(critical)`,
    // Freshness here is a property of the REQUEST, not the route: a plain ship/deliver never
    // needs it, a `forced: true` one does — the same `orders.any.override` tier the direct
    // status-override route inherits automatically through `requirePermission`, restated here
    // because the service's own permission check has no way to demand a step-up on its own.
    'delivery POST /fulfillment-orders/:id/shipments': `requireFreshAuthWhen(critical)`,
    'delivery POST /shipments/:id/deliver': `requireFreshAuthWhen(critical)`,
    // A remainder cancel by a caller holding the refund key is staff's money-out door, at that
    // key's own tier; the buyer's own withdrawal, on the same route, is never prompted.
    'returns POST /': `requireFreshAuthWhen(critical)`,
    // Handing a staff role out, or taking one away, widens or narrows a person's powers: the same
    // critical tier minting an API key asks. A write that names no role is never prompted.
    'users POST /': `requireFreshAuthWhen(critical)`,
    'users PUT /:id': `requireFreshAuthWhen(critical)`,
    'users PATCH /:id': `requireFreshAuthWhen(critical)`
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

describe('step-up auth guards exactly the routes it is declared for', () => {
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
});
