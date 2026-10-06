/**
 * @module
 * Contract tests for /locales/translations — an entity's translated fields, written and read
 * through the registered entity types. `products` is the entity type registered today, so these
 * cases live apart from the rest of the /locales contract: removing the shop takes exactly this
 * file with it and leaves the language and dictionary suites whole.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createLanguage } from './support';

setupTestDb();

describe('GET & PATCH /locales/translations/:entityType/:id', () => {
    it('answers an empty list matching the spec for an entity with no rows yet', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .get(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.translations).toEqual([]);
    });

    it('upserts a locale and matches the spec', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const product = await createProduct();

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ pt: { fields: { title: 'Cama boa' } } });

        expect(response.status).toBe(200);
        expect(response.body.data.translations).toHaveLength(1);
        expect(response.body.data.translations[0]).toMatchObject({
            locale: 'pt',
            fields: { title: 'Cama boa' },
            origin: 'human'
        });
    });

    it('422s an unregistered entityType, matching the spec', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/locales/translations/bogus/000000000000000000000000')
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it.each(['constructor', 'toString', '__proto__'])(
        '422s %s as an entityType: an inherited property is not a registered type',
        async (entityType) => {
            const { bearer } = await authenticateAs('admin');

            const response = await api()
                .patch(`/locales/translations/${entityType}/000000000000000000000000`)
                .set('Authorization', bearer)
                .send({ translations: {} });

            expect(response.status).toBe(422);
        }
    );

    it('422s a null on the fallback locale, matching the spec', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ en: null });

        expect(response.status).toBe(422);
    });

    it('401s without a token, matching the spec', async () => {
        const product = await createProduct();

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .send({
                en: { fields: { title: 'Cozy Bed' } }
            });

        expect(response.status).toBe(401);
    });
});

describe('PUT /locales/translations/:entityType/:id', () => {
    // Every slot, fallback included, is checked against a real `locales` row — `en` needs one
    // registered here the same way `pt` does, since nothing else in this suite ever upserts it.
    const FALLBACK = { tag: 'en', name: 'English', nativeName: 'English' };

    it('deletes a locale the body does not name, matching the spec', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer, FALLBACK);
        await createLanguage(bearer);
        const product = await createProduct();

        // Seeds both `en` and `pt` first — the PUT below names only `en`.
        await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                en: { fields: { title: 'Cozy Bed' } },
                pt: { fields: { title: 'Cama boa' } }
            });

        const response = await api()
            .put(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'Bed, replaced' } } });

        expect(response.status).toBe(200);
        expect(response.body.data.translations).toHaveLength(1);
        expect(response.body.data.translations[0]).toMatchObject({
            locale: 'en',
            fields: { title: 'Bed, replaced' }
        });
    });

    it('refuses a replace that omits the fallback locale', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer, FALLBACK);
        await createLanguage(bearer);
        const product = await createProduct();

        const response = await api()
            .put(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ pt: { fields: { title: 'Cama boa' } } });

        expect(response.status).toBe(422);
    });
});
