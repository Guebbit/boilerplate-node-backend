/**
 * @module
 * A wrong-typed `email` at `POST /account/email-change` is a 422, never a 500. The step-up guard
 * runs before the body is read, so what reaches validation is whatever the client sent.
 */

import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

describe('POST /account/email-change with a wrong-typed email', () => {
    it.each([
        ['a number', 5],
        ['an object', { address: 'a@example.com' }],
        ['an array', ['a@example.com']],
        ['a boolean', true],
        ['null', null]
    ])('answers 422 for %s, not 500', async (_label, email) => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post('/account/email-change')
            .set('Authorization', bearer)
            .send({ email });

        expect(response.status).toBe(422);
    });
});
