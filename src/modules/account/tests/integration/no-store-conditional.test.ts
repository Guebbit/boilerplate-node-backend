/**
 * A `no-store` read still evaluates `If-None-Match` (RFC 9110 §13.1.2): `no-store` binds caches,
 * not the origin. The account router mounts `noStore`, so `GET /account/sessions` is the probe.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

describe('GET /account/sessions with its own tag', () => {
    it('answers an empty 304 that keeps the ETag and no-store', async () => {
        const { bearer } = await authenticateAs('user');
        /**
         * One warm-up request: the session's `lastUsedAt` is throttled, so the first read after
         * sign-in may touch the row and the body with it.
         */
        await api().get('/account/sessions').set('Authorization', bearer);
        const first = await api().get('/account/sessions').set('Authorization', bearer);

        const second = await api()
            .get('/account/sessions')
            .set('Authorization', bearer)
            .set('If-None-Match', first.headers.etag);

        expect(second.status).toBe(304);
        expect(second.text).toBe('');
        expect(second.headers.etag).toBe(first.headers.etag);
        expect(second.headers['cache-control']).toBe('no-store');
    });
});
