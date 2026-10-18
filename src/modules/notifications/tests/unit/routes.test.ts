/**
 * @module
 * The notifications route table.
 *
 * An inbox is somebody's, so every route is authenticated and gated on a `Notification`
 * rule. The stream's credential is the one thing that can silently break: it is the refresh
 * cookie and must NOT be a bearer guard (an `EventSource` cannot send the header).
 */
import { guardsOn } from '@tests/routes';
import { router } from '@modules/notifications/routes';

describe('notifications routes', () => {
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
