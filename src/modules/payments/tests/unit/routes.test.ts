/**
 * @module
 * The payments route table. Two rules, and both are security rules: everything below the auth wall
 * is authenticated at the router level — money is somebody's — while the provider's webhook sits
 * ABOVE it, because its caller is a machine that authenticates by signing the body. Exactly one
 * route is additionally admin-only: the refund, a self-service withdrawal if left open to any
 * caller, versus an intent or confirm locked to admins being a checkout nobody can complete.
 */

import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/payments/routes';

/** The one route in front of the auth wall — see this suite's docblock. */
const WEBHOOK = 'POST /webhook';

/** A route's guards without its handler, so two routes' guard lists can be compared directly. */
const withoutHandler = (signature: string) => guardsOn(router, signature).slice(0, -1);

describe('payment routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            WEBHOOK,
            'POST /intent',
            'GET /order/:orderId',
            'POST /order/:orderId/refund',
            'POST /:id/confirm',
            'POST /:id/sync'
        ]);
    });

    it.each(routeSignatures(router).filter((signature) => signature !== WEBHOOK))(
        '%s requires a session',
        (signature) => {
            expect(guardsOn(router, signature)).toContain('isAuth');
        }
    );

    it('leaves the webhook unauthenticated, which is what lets the provider reach it', () => {
        // Not an oversight and not a weakening: a PSP has no account here, and the signature over
        // the raw body is a stronger proof of origin than any session this API could ask it for.
        // A session guard added on top of it would silently stop every delivery arriving.
        expect(guardsOn(router, WEBHOOK)).not.toContain('isAuth');
        expect(guardsOn(router, WEBHOOK)).not.toContain('getAuth');
    });

    it('declares the webhook before the auth wall', () => {
        // Order is the mechanism: `router.use(getAuth, isAuth)` applies to everything declared
        // after it, so a webhook moved below this line stops working with no error anywhere.
        expect(routeSignatures(router).indexOf(WEBHOOK)).toBe(0);
    });

    it('admin-guards the refund, and only the refund', () => {
        // The one route that moves money back out. Everything else is the customer's own
        // checkout, which they must be able to complete themselves.
        const adminGuarded = routeSignatures(router).filter((signature) =>
            guardsOn(router, signature).includes('isAdmin')
        );

        expect(adminGuarded).toEqual(['POST /order/:orderId/refund']);
    });

    it('guards the sync exactly as it guards the confirm', () => {
        // `sync` settles money just as `confirm` does — from the provider's answer rather than
        // from a method the caller supplied — so it carries the same guards, not fewer. Compared
        // as a whole rather than named one by one: `requireFreshAuth(…)` is a closure with no
        // name of its own, and asserting the two lists match survives that.
        expect(withoutHandler('POST /:id/sync')).toEqual(withoutHandler('POST /:id/confirm'));
        // And that pair is not trivially empty — the fresh-session closure and the verified check
        // are both in there.
        expect(withoutHandler('POST /:id/sync')).toEqual([
            'getAuth',
            'isAuth',
            '(anonymous)',
            'requireVerified'
        ]);
    });

    it('declares the refund before the bare /:id routes', () => {
        // `/order/:orderId/refund` is three segments and `/:id/confirm` is two, so they cannot
        // collide today. The ordering is the convention this module states, and asserting it
        // stops a two-segment admin route added later from being shadowed.
        const paths = routeSignatures(router);

        expect(paths.indexOf('POST /order/:orderId/refund')).toBeLessThan(
            paths.indexOf('POST /:id/confirm')
        );
    });
});
