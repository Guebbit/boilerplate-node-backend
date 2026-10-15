/**
 * @module
 * The notifications route table.
 *
 * An inbox is somebody's, so every route is authenticated and gated on a `Notification`
 * rule. Two things can silently break: ORDER — the literal segments must precede `/:id` — and the
 * stream's credential, which is the refresh cookie and must NOT be a bearer guard (an
 * `EventSource` cannot send the header).
 */
import { routeSignatures, guardsOn } from '@tests/routes';
import { router } from '@modules/notifications/routes';

describe('notifications routes', () => {
    it('mounts exactly the documented endpoints, in the documented order', () => {
        expect(routeSignatures(router)).toEqual([
            'GET /stream',
            'GET /',
            'POST /read-all',
            'POST /dismiss-all',
            'DELETE /:id'
        ]);
    });

    it.each(['GET /', 'POST /read-all', 'POST /dismiss-all', 'DELETE /:id'])(
        '%s requires a bearer session and a key',
        (signature) => {
            const guards = guardsOn(router, signature);

            expect(guards).toContain('isAuth');
            expect(guards).toContain('requirePermissionGuard');
        }
    );

    it('authenticates the stream by cookie, not by bearer token', () => {
        const guards = guardsOn(router, 'GET /stream');

        expect(guards).toContain('requirePermissionViaCookieGuard');
        expect(guards).not.toContain('isAuth');
    });
});
