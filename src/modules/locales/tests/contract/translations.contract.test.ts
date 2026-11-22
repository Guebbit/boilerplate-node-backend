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
    it('answers the source and an empty list matching the spec for an entity with no rows yet', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ title: 'Cozy Bed' });

        const response = await api()
            .get(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.translations).toEqual([]);
        expect(response.body.source.fields).toEqual({ title: 'Cozy Bed' });
    });

    it('upserts a locale and matches the spec', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const product = await createProduct();

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ pt: { fields: { title: 'Cama boa' }, origin: 'human' } });

        expect(response.status).toBe(200);
        expect(response.body.translations).toHaveLength(1);
        expect(response.body.translations[0]).toMatchObject({
            locale: 'pt',
            fields: { title: 'Cama boa' },
            origin: 'human',
            outdated: false
        });
    });

    it('422s a locale entry that leaves out origin: a merge patch has no default to apply', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const product = await createProduct();

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ pt: { fields: { title: 'Cama boa' } } });

        expect(response.status).toBe(422);
    });

    it('404s an unregistered entityType, like any path that names nothing', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get('/locales/translations/bogus/000000000000000000000000')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it.each(['constructor', 'toString', '__proto__'])(
        '404s %s as an entityType: an inherited property is not a registered type',
        async (entityType) => {
            const { bearer } = await authenticateAs('admin');

            const response = await api()
                .patch(`/locales/translations/${entityType}/000000000000000000000000`)
                .set('Authorization', bearer)
                .send({ en: { fields: { title: 'x' }, origin: 'human' } });

            expect(response.status).toBe(404);
        }
    );

    it.each([
        ['null', null],
        ['an entry', { fields: { title: 'Cozy Bed' }, origin: 'human' }]
    ])('422s %s on the default language, matching the spec', async (_label, slot) => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ en: slot });

        expect(response.status).toBe(422);
    });
});

describe('PUT /locales/translations/:entityType/:id', () => {
    it('deletes a locale the body does not name, matching the spec', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        await createLanguage(bearer, { tag: 'de', name: 'German', nativeName: 'Deutsch' });
        const product = await createProduct();

        // Seeds both `pt` and `de` first — the PUT below names only `pt`.
        await api()
            .patch(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({
                pt: { fields: { title: 'Cama boa' }, origin: 'human' },
                de: { fields: { title: 'Hundekorb' }, origin: 'human' }
            });

        const response = await api()
            .put(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ pt: { fields: { title: 'Cama, replaced' } } });

        expect(response.status).toBe(200);
        expect(response.body.translations).toHaveLength(1);
        expect(response.body.translations[0]).toMatchObject({
            locale: 'pt',
            fields: { title: 'Cama, replaced' }
        });
    });

    it('stores origin human when a replace leaves it out', async () => {
        const { bearer } = await authenticateAs('admin');
        await createLanguage(bearer);
        const product = await createProduct();

        const response = await api()
            .put(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ pt: { fields: { title: 'Cama boa' } } });

        expect(response.status).toBe(200);
        expect(response.body.translations[0]).toMatchObject({ locale: 'pt', origin: 'human' });
    });

    it('refuses a replace that names the default language', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .put(`/locales/translations/product/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ en: { fields: { title: 'Cozy Bed' } } });

        expect(response.status).toBe(422);
    });
});
