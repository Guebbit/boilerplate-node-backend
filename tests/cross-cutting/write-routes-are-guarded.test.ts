/**
 * One app-wide guard: every write route is authenticated by default, and behind a
 * `requirePermission` key by default too, unless the route is listed in {@link WRITE_EXCEPTIONS}
 * below with a reason.
 *
 * Each routed module's own `routes.test.ts` suite states its own authorization in full, and that
 * stays valuable — mount order, cache tags, and upload fields are genuinely per-module. But "every
 * write demands a permission key" is an app-wide property, and stating it locally, once per
 * module, enforces it globally nowhere: a module with no `routes.test.ts` of its own would be
 * guarded by nothing. This file states the property once, for every routed module at once, so a
 * new module inherits the guarantee instead of needing to opt into it.
 *
 * `WRITE_EXCEPTIONS` is the actual guardrail's shape: MOST writes here are somebody's own resource
 * (a cart, a wishlist, an address book, a session) rather than a staff action, so the exception
 * list is not the short allowlist a fully keyed API would have — it is the list of every write in
 * the app that deliberately needs no key, plus the handful that need no session at all. Every entry is a decision someone made when the route was written; this is the one place
 * they are all listed together.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Router } from 'express';
import { effectiveRouteTable, guardsOn, identityGuardIndex } from '@tests/routes';
import { ROUTED_MODULES } from '@tests/routed-modules';
import { MODULES_ROOT } from '@tests/paths';

jest.mock('@infrastructure/http/middlewares/cache', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').cacheMock()
);
jest.mock('@infrastructure/http/middlewares/route-flag', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').routeFlagMock()
);
jest.mock('@infrastructure/http/middlewares/upload', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').storageMock()
);
jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

/** The four HTTP methods that change state — the ones this guard applies to. */
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * One write route's exception from the default (an identity guard, then `requirePermission`).
 *
 * `requiresAuth: false` is reserved for a route that genuinely needs no session — either there is
 * none to have yet (login, signup), or a token IN the request is itself the credential (an emailed
 * reset/verify/confirm link). Every other exception is `requiresAuth: true`: authenticated, but
 * deliberately keyless because the write is scoped to the caller's own resource.
 */
interface WriteException {
    requiresAuth: boolean;
    reason: string;
}

/** Write routes exempt from the app-wide default, keyed `${module} ${METHOD} ${path}`. */
const WRITE_EXCEPTIONS: Record<string, WriteException> = {
    'feedback POST /contact': {
        requiresAuth: false,
        reason: 'the visitor contact form, mounted above the keyed gate on purpose'
    },
    'products POST /search': {
        requiresAuth: false,
        reason: 'a read wearing a POST, because a GET body is invisible to the cache key'
    },
    'orders POST /search': {
        requiresAuth: true,
        reason: 'the same read-as-POST, but the orders router blanket-authenticates every route'
    },
    'orders POST /:id/cancel': {
        requiresAuth: true,
        reason: 'the one order write a customer may make — the service scopes it to their own order'
    },
    'account PUT /': { requiresAuth: true, reason: "editing the caller's own profile" },
    'account DELETE /': {
        requiresAuth: true,
        reason: "requesting deletion of the caller's own account"
    },
    'account DELETE /delete-confirm': {
        requiresAuth: false,
        reason: 'the emailed confirmation token is the credential'
    },
    'account POST /login': {
        requiresAuth: false,
        reason: 'credential exchange — there is no session yet to require'
    },
    'account POST /signup': {
        requiresAuth: false,
        reason: 'registration — there is no session yet'
    },
    'account POST /reset': {
        requiresAuth: false,
        reason: 'password-reset request — the caller has no session to prove'
    },
    'account POST /reset-confirm': {
        requiresAuth: false,
        reason: 'the emailed reset token is the credential'
    },
    'account POST /password': {
        requiresAuth: true,
        reason: "changing the caller's own password, proving the current one"
    },
    'account POST /password/check': {
        requiresAuth: false,
        reason: 'advisory breach check — signup needs it before an account exists'
    },
    'account POST /reauth': {
        requiresAuth: true,
        reason: "re-proving the caller's own password to refresh their session's freshness"
    },
    'account POST /export': {
        requiresAuth: true,
        reason: "exporting the caller's own data — a read wearing a POST, since requireFreshAuth needs a body-free request"
    },
    'account POST /login/2fa': {
        requiresAuth: false,
        reason: 'the second step of a 2FA login — the challenge token is the credential, not a session'
    },
    'account POST /login/2fa/send': {
        requiresAuth: false,
        reason: 'delivering a login code — same footing as the step it belongs to, the challenge token is the credential'
    },
    'account POST /2fa/methods/:method/setup': {
        requiresAuth: true,
        reason: "enrolling a second factor on the caller's own account"
    },
    'account POST /2fa/methods/:method/confirm': {
        requiresAuth: true,
        reason: "arming the caller's own pending factor"
    },
    'account DELETE /2fa/methods/:method': {
        requiresAuth: true,
        reason: "removing one of the caller's own second factors"
    },
    'account DELETE /2fa': {
        requiresAuth: true,
        reason: "disabling every one of the caller's own second factors"
    },
    'account POST /2fa/backup-codes': {
        requiresAuth: true,
        reason: "regenerating the caller's own backup codes"
    },
    'account POST /logout': {
        requiresAuth: false,
        reason: 'revoking THIS session — the refresh-token cookie is the credential, not a login'
    },
    'account POST /logout-all': {
        requiresAuth: true,
        reason: "revoking all of the caller's own sessions"
    },
    'account DELETE /sessions/:sessionId': {
        requiresAuth: true,
        reason: "revoking one of the caller's own sessions"
    },
    'addresses POST /addresses': {
        requiresAuth: true,
        reason: "adding to the caller's own address book"
    },
    'addresses PUT /addresses/:addressId': {
        requiresAuth: true,
        reason: "editing an entry in the caller's own address book"
    },
    'addresses DELETE /addresses/:addressId': {
        requiresAuth: true,
        reason: "removing an entry from the caller's own address book"
    },
    'account POST /verify-request': {
        requiresAuth: true,
        reason: "re-sending the caller's own verification email"
    },
    'account POST /verify-confirm': {
        requiresAuth: false,
        reason: 'the emailed verification token is the credential'
    },
    'account POST /email-change-confirm': {
        requiresAuth: false,
        reason: 'the emailed email-change token is the credential'
    },
    'cart POST /reorder/:orderId': {
        requiresAuth: true,
        reason: "copying one of the caller's own orders back into their own cart"
    },
    'cart POST /': { requiresAuth: true, reason: "adding an item to the caller's own cart" },
    'cart DELETE /all': { requiresAuth: true, reason: "clearing the caller's own cart" },
    'cart DELETE /': {
        requiresAuth: true,
        reason: "removing one item from the caller's own cart, productId in the body"
    },
    'cart PUT /:productId': {
        requiresAuth: true,
        reason: "setting a quantity in the caller's own cart"
    },
    'cart DELETE /:productId': {
        requiresAuth: true,
        reason: "removing one item from the caller's own cart"
    },
    'wishlist POST /': {
        requiresAuth: true,
        reason: "saving a product to the caller's own wishlist"
    },
    'wishlist POST /:productId/move-to-cart': {
        requiresAuth: true,
        reason: "moving an item from the caller's own wishlist to their own cart"
    },
    'wishlist DELETE /:productId': {
        requiresAuth: true,
        reason: "removing a product from the caller's own wishlist"
    },
    'payments POST /webhook': {
        requiresAuth: false,
        reason: 'the payment provider reporting an outcome — a machine with no account, which authenticates by signing the raw body instead'
    }
};

/** Every write route mounted on a router, as `${METHOD} ${path}` signatures. */
const writesOn = (router: Router): string[] =>
    effectiveRouteTable(router)
        .filter(({ method }) => WRITE_METHODS.has(method))
        .map(({ method, path: routePath }) => `${method} ${routePath}`);

describe('every write route is guarded by default', () => {
    it('imports one router per module directory that has one, so a new module cannot go unchecked', () => {
        const withRouter = readdirSync(MODULES_ROOT).filter((name) =>
            existsSync(path.join(MODULES_ROOT, name, 'routes.ts'))
        );

        expect(Object.keys(ROUTED_MODULES).toSorted()).toEqual(withRouter.toSorted());
    });

    it('has no stale exception — every listed route is still mounted and still a write', () => {
        const mountedWrites = new Set(
            Object.entries(ROUTED_MODULES).flatMap(([moduleName, router]) =>
                writesOn(router).map((signature) => `${moduleName} ${signature}`)
            )
        );

        expect(Object.keys(WRITE_EXCEPTIONS).filter((key) => !mountedWrites.has(key))).toEqual([]);
    });

    for (const [moduleName, router] of Object.entries(ROUTED_MODULES)) {
        const writes = writesOn(router);
        // `observability` mounts no writes at all — `it.each` rejects an empty table outright.
        if (writes.length === 0) continue;

        it.each(writes)(`${moduleName} %s`, (signature) => {
            const exception = WRITE_EXCEPTIONS[`${moduleName} ${signature}`];
            const guards = guardsOn(router, signature);

            const identityIndex = identityGuardIndex(guards);

            if (exception === undefined) {
                // The default: authenticated, then holding the route's key, in that order.
                expect(identityIndex).toBeGreaterThanOrEqual(0);
                expect(guards).toContain('requirePermissionGuard');
                expect(identityIndex).toBeLessThan(guards.indexOf('requirePermissionGuard'));
                return;
            }

            expect(guards).not.toContain('requirePermissionGuard');
            if (exception.requiresAuth) expect(identityIndex).toBeGreaterThanOrEqual(0);
            else expect(identityIndex).toBe(-1);
        });
    }
});
