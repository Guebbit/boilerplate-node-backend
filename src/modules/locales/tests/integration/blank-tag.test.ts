/**
 * @module
 * A `{locale}` that is blank once trimmed (`/locales/%20`) must answer, not hang: the tag
 * normalizes to `''`, an id that matches no language, so the write answers the ordinary 404.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';

setupTestDb();

describe('PUT and PATCH /locales/{locale} with a blank tag', () => {
    it('answers 404 to PATCH', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .patch('/locales/%20')
            .set('Authorization', bearer)
            .send({ name: 'Blank' });

        expect(response.status).toBe(404);
    }, 15_000);

    it('answers 404 to PUT', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .put('/locales/%20')
            .set('Authorization', bearer)
            .send({ name: 'Blank', nativeName: 'Blank', direction: 'ltr' });

        expect(response.status).toBe(404);
    }, 15_000);
});
