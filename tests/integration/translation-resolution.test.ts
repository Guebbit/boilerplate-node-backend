/**
 * A page of products resolves in ONE query, in the caller's negotiated language — the read half
 * of the translator's door. Cross-module by nature (a product's read path, a row the `locales`
 * module owns), so this lives at the top level rather than under either module's `tests/`.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { createProduct } from '@modules/products/tests/fixtures';
import { localeRepository, translationRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/fixtures';

setupTestDb();

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

const givenLocale = (tag: string) =>
    localeRepository.create(makeLocale({ tag, name: tag, nativeName: tag }));

const givenTranslation = (productId: string, locale: string, title: string) =>
    translationRepository.upsertEntityLocale(
        'product',
        productId,
        locale,
        { title },
        'human',
        undefined,
        locale === FALLBACK ? undefined : 'digest'
    );

describe('GET /products/:id resolves to the caller’s language', () => {
    it('returns the Italian title for Accept-Language: it', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Dog Bed' });
        await givenTranslation(String(product._id), 'it', 'Cuccia');

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Accept-Language', 'it');

        expect(response.status).toBe(200);
        expect(response.body.data.title).toBe('Cuccia');
        expect(response).toSatisfyApiSpec();
    });

    it('falls back to the source title rather than blanking when untranslated', async () => {
        const product = await createProduct({ title: 'Dog Bed' });

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Accept-Language', 'it');

        expect(response.status).toBe(200);
        expect(response.body.data.title).toBe('Dog Bed');
    });

    it('resolves a region tag to its base language', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Dog Bed' });
        await givenTranslation(String(product._id), 'it', 'Cuccia');

        const response = await api()
            .get(`/products/${String(product._id)}`)
            .set('Accept-Language', 'it-CH');

        expect(response.body.data.title).toBe('Cuccia');
    });
});

describe('GET /products resolves a whole page in one batched query', () => {
    it('translates every item on the page for the negotiated language', async () => {
        await givenLocale('it');
        const bed = await createProduct({ title: 'Dog Bed' });
        const bowl = await createProduct({ title: 'Dog Bowl' });
        await givenTranslation(String(bed._id), 'it', 'Cuccia');
        await givenTranslation(String(bowl._id), 'it', 'Ciotola');

        const response = await api().get('/products').set('Accept-Language', 'it');

        expect(response.status).toBe(200);
        const titles = (response.body.data.items as { title: string }[])
            .map(({ title }) => title)
            .toSorted();
        expect(titles).toEqual(['Ciotola', 'Cuccia']);
        expect(response).toSatisfyApiSpec();
    });

    it('mixes translated and fallback items on the same page without blanking either', async () => {
        await givenLocale('it');
        const translated = await createProduct({ title: 'Dog Bed' });
        const untranslated = await createProduct({ title: 'Dog Bowl' });
        await givenTranslation(String(translated._id), 'it', 'Cuccia');

        const response = await api().get('/products').set('Accept-Language', 'it');

        const byId = new Map(
            (response.body.data.items as { id: string; title: string }[]).map((item) => [
                item.id,
                item.title
            ])
        );
        expect(byId.get(String(translated._id))).toBe('Cuccia');
        expect(byId.get(String(untranslated._id))).toBe('Dog Bowl');
    });
});
