/**
 * One language per request, from every language that is switched on.
 *
 * FE files, BE files and DB records must agree on the language a request is answered in. These
 * drive the real routes with a language that exists only as database rows (Spanish: no deployed
 * dictionary file) and with a deployed one (Italian) that an admin switches off, and check every
 * place that follows the pick: the product text, the search, the `Content-Language` label, the
 * API's own wording, the language a signup saves, and what happens the moment a switch is flipped.
 *
 * Cross-module by nature (locales, products, account), so it lives at the top level.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { userModel } from '@modules/users/model';
import { translationRepository } from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';
import { localeService } from '@modules/locales/services';
import {
    refreshLocaleOverrides,
    registerLocaleOverrideProvider,
    resetLocaleOverrides,
    translator
} from '@infrastructure/i18n';

setupTestDb();

beforeAll(() => {
    registerLocaleOverrideProvider(() => localeService.readLocaleOverlay());
});

afterEach(() => {
    resetLocaleOverrides();
});

afterAll(() => {
    registerLocaleOverrideProvider(undefined);
});

/** The English wording of the 404 for an unknown product, which Spanish has no file for. */
const ENGLISH_NOT_FOUND = translator('en')('products.not-found');

/**
 * Registers Spanish as rows only, with one product titled in it, and lets the served list learn
 * about it the way the refresh timer would.
 */
const givenSpanishProduct = async (title: string, spanishTitle: string) => {
    await givenLocale('es');
    const product = await createProduct({ title });
    await translationRepository.upsertEntityLocale(
        'product',
        String(product._id),
        'es',
        { title: spanishTitle },
        'human',
        undefined,
        'digest'
    );
    await refreshLocaleOverrides();
    return String(product._id);
};

describe('a language that exists only as database rows', () => {
    it('serves product text in it once it is switched on', async () => {
        const id = await givenSpanishProduct('Lamp', 'Lámpara');

        const response = await api().get(`/products/${id}`).set('Accept-Language', 'es');

        expect(response.status).toBe(200);
        expect(response.body.data.title).toBe('Lámpara');
    });

    it('labels the answer with the language it is written for', async () => {
        const id = await givenSpanishProduct('Lamp', 'Lámpara');

        const response = await api().get(`/products/${id}`).set('Accept-Language', 'es');

        expect(response.headers['content-language']).toBe('es');
    });

    // The API has no Spanish wording of its own: each message falls back to the default language,
    // one key at a time, and nothing throws or logs a rejected language on the way.
    it("words the API's own messages in the default language", async () => {
        await givenSpanishProduct('Lamp', 'Lámpara');

        const response = await api()
            .get('/products/000000000000000000000000')
            .set('Accept-Language', 'es');

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.headers['content-language']).toBe('es');
        expect(response.body.errors[0].message).toBe(ENGLISH_NOT_FOUND);
    });

    it('finds a product by the word it has in that language', async () => {
        const id = await givenSpanishProduct('Lamp', 'Lámpara');

        const response = await api()
            .get('/products')
            .query({ text: 'lámpara' })
            .set('Accept-Language', 'es');

        expect(response.status).toBe(200);
        expect((response.body.data.items as { id: string }[]).map((item) => item.id)).toEqual([id]);
    });

    it('is the language a signup saves for the new account', async () => {
        await givenSpanishProduct('Lamp', 'Lámpara');

        const response = await api().post('/account/signup').set('Accept-Language', 'es').send({
            email: 'nueva@example.com',
            username: 'nueva',
            password: PLAIN_PASSWORD,
            passwordConfirm: PLAIN_PASSWORD,
            termsAccepted: true
        });

        expect(response.status).toBe(201);
        const saved = await userModel.findOne({ email: 'nueva@example.com' }).lean().exec();
        expect(saved?.locale).toBe('es');
    });

    it('does not mix with the default language on the same product', async () => {
        const id = await givenSpanishProduct('Lamp', 'Lámpara');

        const english = await api().get(`/products/${id}`).set('Accept-Language', 'en');
        const spanish = await api().get(`/products/${id}`).set('Accept-Language', 'es');
        const again = await api().get(`/products/${id}`).set('Accept-Language', 'en');

        expect(english.body.data.title).toBe('Lamp');
        expect(spanish.body.data.title).toBe('Lámpara');
        expect(again.body.data.title).toBe('Lamp');
    });

    it('stops being picked the moment an admin switches it off', async () => {
        const id = await givenSpanishProduct('Lamp', 'Lámpara');
        const { bearer } = await authenticateAs('admin');

        const off = await api()
            .patch('/locales/es')
            .set('Authorization', bearer)
            .send({ active: false });
        const response = await api().get(`/products/${id}`).set('Accept-Language', 'es');

        expect(off.status).toBe(200);
        expect(response.headers['content-language']).toBe('en');
        expect(response.body.data.title).toBe('Lamp');
    });

    it('is picked again the moment an admin switches it back on', async () => {
        const id = await givenSpanishProduct('Lamp', 'Lámpara');
        const { bearer } = await authenticateAs('admin');
        await api().patch('/locales/es').set('Authorization', bearer).send({ active: false });

        await api().patch('/locales/es').set('Authorization', bearer).send({ active: true });
        const response = await api().get(`/products/${id}`).set('Accept-Language', 'es');

        expect(response.headers['content-language']).toBe('es');
        expect(response.body.data.title).toBe('Lámpara');
    });

    it('is picked as soon as an admin registers it switched on, without a wait for the timer', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ title: 'Lamp' });

        const created = await api()
            .post('/locales')
            .set('Authorization', bearer)
            .send({ tag: 'es', name: 'Spanish', nativeName: 'Español' });
        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Accept-Language', 'es');

        expect(created.status).toBe(201);
        expect(response.headers['content-language']).toBe('es');
    });
});

describe('a language with a deployed file that an admin switches off', () => {
    it('is never picked again, and a request for it gets the default language', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Dog Bed' });
        await translationRepository.upsertEntityLocale(
            'product',
            String(product._id),
            'it',
            { title: 'Cuccia' },
            'human',
            undefined,
            'digest'
        );
        const { bearer } = await authenticateAs('admin');

        const before = await api()
            .get(`/products/${String(product._id)}`)
            .set('Accept-Language', 'it');
        await api().patch('/locales/it').set('Authorization', bearer).send({ active: false });
        const after = await api()
            .get(`/products/${String(product._id)}`)
            .set('Accept-Language', 'it');

        expect(before.body.data.title).toBe('Cuccia');
        expect(before.headers['content-language']).toBe('it');
        expect(after.body.data.title).toBe('Dog Bed');
        expect(after.headers['content-language']).toBe('en');
    });

    it("answers the API's own dictionary for it with a 404, like an unknown language", async () => {
        await givenLocale('it', { active: false });
        await refreshLocaleOverrides();

        const response = await api().get('/locales/it');

        expect(response.status).toBe(404);
    });
});
