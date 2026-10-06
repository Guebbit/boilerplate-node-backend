/**
 * @module
 * A wrong-typed value in a field the routes pre-read (`isChangingEmail` runs before validation) is a
 * 422, never a 500: the guard must not throw on what the validator is about to refuse.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

describe('PATCH /account and PUT /account with a wrong-typed email', () => {
    it.each([
        ['a number', 5],
        ['an object', { address: 'a@example.com' }],
        ['an array', ['a@example.com']],
        ['a boolean', true]
    ])('answers 422 for %s, not 500', async (_label, email) => {
        const { bearer } = await authenticateAs('user');

        const patch = await api().patch('/account').set('Authorization', bearer).send({ email });
        const put = await api()
            .put('/account')
            .set('Authorization', bearer)
            .send({ email, username: 'someone', analyticsConsent: false });

        expect(patch.status).toBe(422);
        expect(put.status).toBe(422);
    });

    it('answers 422 for a null email too: it is not "no change"', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .patch('/account')
            .set('Authorization', bearer)
            .send({ email: null });

        expect(response.status).toBe(422);
    });
});
