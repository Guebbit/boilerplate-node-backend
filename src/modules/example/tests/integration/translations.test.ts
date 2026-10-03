/**
 * @module
 * The example's title is translatable. This drives the `locales` door end to end: the module
 * registered itself as a translatable entity type, the fallback-language write is copied back onto
 * the row (what a list shows), and another language leaves the row alone.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createExample, fieldOf } from '../factories';

setupTestDb();

/** Registers a language through the real route; a translation slot needs a real `locales` row. */
const registerLanguage = (
    bearer: string,
    language: { tag: string; name: string; nativeName: string }
) => api().post('/locales').set('Authorization', bearer).send(language);

/** Signs in as an administrator with `en` (the fallback) and `it` registered. */
const adminWithLanguages = async () => {
    const admin = await authenticateAs('admin');
    await registerLanguage(admin.bearer, { tag: 'en', name: 'English', nativeName: 'English' });
    await registerLanguage(admin.bearer, { tag: 'it', name: 'Italian', nativeName: 'Italiano' });
    return admin;
};

describe('translating an example’s title through /locales', () => {
    it('copies the fallback-language title onto the row', async () => {
        const { user, bearer } = await adminWithLanguages();
        const example = await createExample({ userId: user.id, title: 'Before' });

        const response = await api()
            .patch(`/locales/translations/example/${String(example._id)}`)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'After' } } });

        expect(response.status).toBe(200);
        expect(await fieldOf(String(example._id), 'title')).toBe('After');
    });

    it('leaves the row’s own title alone for another language, and stores that language', async () => {
        const { user, bearer } = await adminWithLanguages();
        const example = await createExample({ userId: user.id, title: 'Hello' });

        const response = await api()
            .patch(`/locales/translations/example/${String(example._id)}`)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'Ciao' } } });

        expect(response.status).toBe(200);
        expect(response.body.data.translations[0]).toMatchObject({
            locale: 'it',
            fields: { title: 'Ciao' }
        });
        expect(await fieldOf(String(example._id), 'title')).toBe('Hello');
    });

    it('refuses a field the module did not declare translatable', async () => {
        const { user, bearer } = await adminWithLanguages();
        const example = await createExample({ userId: user.id });

        const response = await api()
            .patch(`/locales/translations/example/${String(example._id)}`)
            .set('Authorization', bearer)
            .send({ it: { fields: { body: 'Not translatable' } } });

        expect(response.status).toBe(422);
    });

    it('answers 404 for an example that does not exist', async () => {
        const { bearer } = await adminWithLanguages();

        const response = await api()
            .patch(`/locales/translations/example/${'f'.repeat(24)}`)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'Ciao' } } });

        expect(response.status).toBe(404);
    });
});
