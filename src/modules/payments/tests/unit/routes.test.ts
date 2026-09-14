/**
 * @module
 * The payments route table. Two rules, and both are security rules: everything below the auth wall
 * is authenticated at the router level — money is somebody's — while the provider's webhook and
 * `GET /methods` sit ABOVE it: the webhook's caller is a machine that authenticates by signing the
 * body, and which methods are offered is pre-purchase information nobody need sign in to read.
 * Exactly two routes are additionally admin-only: the refund and the offline record, a self-service
 * withdrawal or a self-reported "I paid" if left open to any caller, versus an intent or confirm
 * locked to admins being a checkout nobody can complete.
 */

import { routeSignatures, routeTable, guardsOn } from '@tests/routes';

jest.mock('@infrastructure/http/middlewares/rate-limit', () =>
    jest.requireActual<typeof import('@tests/routes')>('@tests/routes').securityMock()
);

import { router } from '@modules/payments/routes';

/** The one route in front of the auth wall that authenticates by signing its own body. */
const WEBHOOK = 'POST /webhook';

/** The other route in front of the auth wall — public, like `GET /delivery/methods`. */
const METHODS = 'GET /methods';

/** A route's guards without its handler, so two routes' guard lists can be compared directly. */
const withoutHandler = (signature: string) => guardsOn(router, signature).slice(0, -1);

describe('payment routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            WEBHOOK,
            METHODS,
            'POST /intent',
            'GET /order/:orderId',
            'POST /order/:orderId/refund',
            'POST /order/:orderId/offline',
            'POST /:id/confirm',
            'POST /:id/sync'
        ]);
    });

    it.each(
        routeSignatures(router).filter(
            (signature) => signature !== WEBHOOK && signature !== METHODS
        )
    )('%s requires a session', (signature) => {
        expect(guardsOn(router, signature)).toContain('isAuth');
    });

    it('leaves the webhook unauthenticated, which is what lets the provider reach it', () => {
        // Not an oversight and not a weakening: a PSP has no account here, and the signature over
        // the raw body is a stronger proof of origin than any session this API could ask it for.
        // A session guard added on top of it would silently stop every delivery arriving.
        expect(guardsOn(router, WEBHOOK)).not.toContain('isAuth');
        expect(guardsOn(router, WEBHOOK)).not.toContain('getAuth');
    });

    it('leaves the methods list unauthenticated, same as GET /delivery/methods', () => {
        expect(guardsOn(router, METHODS)).not.toContain('isAuth');
        expect(guardsOn(router, METHODS)).not.toContain('getAuth');
    });

    it('carries a rate limit — the one budget this route has, since a signature is not one', () => {
        expect(guardsOn(router, WEBHOOK)).toContain('webhookLimiter');
    });

    it('declares the webhook before the auth wall', () => {
        // Order is the mechanism: `router.use(getAuth, isAuth)` applies to everything declared
        // after it, so a webhook moved below this line stops working with no error anywhere.
        expect(routeSignatures(router).indexOf(WEBHOOK)).toBe(0);
    });

    it('admin-guards the refund and the offline record, and nothing else', () => {
        // The two routes an operator drives instead of a customer's own checkout — money moving
        // back out, or a claim that money moved in some way the provider never saw.
        // `cart.self.checkout` is excluded: it gates the three customer-facing routes below and is the
        // customer's own key, not an admin one — see the module docblock's "Verified" row.
        const adminGuarded = routeTable(router)
            .filter(
                ({ permissionKey }) =>
                    permissionKey !== undefined && permissionKey !== 'cart.self.checkout'
            )
            .map(({ method, path }) => `${method} ${path}`);

        expect(adminGuarded).toEqual([
            'POST /order/:orderId/refund',
            'POST /order/:orderId/offline'
        ]);
    });

    it('guards the sync exactly as it guards the confirm, plus the velocity budgets and idempotency key confirm alone carries', () => {
        // `sync` settles money just as `confirm` does — from the provider's answer rather than
        // from a method the caller supplied — so it carries every guard `confirm` does, not
        // fewer. The deliberate exceptions are the two payment-velocity limiters, the decline
        // challenge gate and `idempotencyKey`: card testing validates a card at CONFIRM, `sync`
        // never accepts a `paymentMethodRef`, and `sync` is already idempotent by construction,
        // keyed on the provider's own payment reference. Compared as a whole rather than named
        // one by one: `requireFreshAuth(…)` is a closure with no name of its own, and asserting
        // the two lists match survives that.
        expect(withoutHandler('POST /:id/confirm')).toEqual([
            ...withoutHandler('POST /:id/sync'),
            'paymentConfirmAttemptLimiter',
            'paymentConfirmDeclineLimiter',
            'paymentDeclineChallengeGate',
            'idempotencyKey'
        ]);
        // And that shared prefix is not trivially empty — the fresh-session closure and the
        // cart.self.checkout check are both in there.
        expect(withoutHandler('POST /:id/sync')).toEqual([
            'getAuth',
            'isAuth',
            '(anonymous)',
            'requirePermissionGuard'
        ]);
    });

    it('declares the refund and the offline record before the bare /:id routes', () => {
        // `/order/:orderId/refund` and `/order/:orderId/offline` are three segments and
        // `/:id/confirm` is two, so they cannot collide today. The ordering is the convention this
        // module states, and asserting it stops a two-segment admin route added later from being
        // shadowed.
        const paths = routeSignatures(router);

        expect(paths.indexOf('POST /order/:orderId/refund')).toBeLessThan(
            paths.indexOf('POST /:id/confirm')
        );
        expect(paths.indexOf('POST /order/:orderId/offline')).toBeLessThan(
            paths.indexOf('POST /:id/confirm')
        );
    });
});
