import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';

/**
 * cookie-parser turns a `j:`-prefixed cookie into parsed JSON, so `jwt=j:{"$ne":null}` reaches a
 * controller as an object. Reading the cookie must yield a string or nothing, or the object goes
 * on to a Mongo filter (or a string method) and answers 500.
 */

setupTestDb();

describe('a j: cookie on a credential route', () => {
    it('is read as "no session", not as an object: logout answers 200', async () => {
        const response = await api()
            .post('/account/logout')
            .set('Cookie', `jwt=${encodeURIComponent('j:{"$ne":null}')}`);

        expect(response.status).toBe(200);
    });
});
