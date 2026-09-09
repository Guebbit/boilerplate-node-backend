/**
 * @module
 * `getEntityTranslations` / `upsertEntityTranslations` — the translator's door, driven against a
 * real database. Every property here needs Mongo: the registry lookup, the `locales` collection
 * check, the derived-index-column write on `products`, and the digest a sibling row is stamped
 * with.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/fixtures';
import { productRepository } from '@modules/products';
import { makeLocale } from '@modules/locales/fixtures';
import { localeRepository, translationRepository } from '@modules/locales/repository';
import { localeService } from '@modules/locales/services';

setupTestDb();

beforeAll(() => {
    localeService.setTranslatables({
        product: { collection: 'products', fields: ['title', 'description'], cacheTag: 'products' }
    });
});

afterAll(() => {
    localeService.setTranslatables({});
});

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

const givenLocale = (tag: string, overrides: { active?: boolean } = {}) =>
    localeRepository.create(makeLocale({ tag, name: tag, nativeName: tag, ...overrides }));

// Every case below writes the fallback locale at least once — it is a row like any other, no
// special case, so the write path checks it exists and is active exactly as it would any other.
beforeEach(async () => {
    await givenLocale(FALLBACK);
});

describe('getEntityTranslations', () => {
    it('refuses an unregistered entityType', async () => {
        const result = await localeService.getEntityTranslations('bogus', 'p1');

        expect(result.success).toBe(false);
        expect(result.status).toBe(422);
    });

    it('answers an empty list for an entity with no rows yet', async () => {
        const result = await localeService.getEntityTranslations('product', 'p1');

        expect(result.success).toBe(true);
        expect(result.data?.translations).toEqual([]);
    });

    it('lists every locale row for the entity, sorted by locale', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await localeService.upsertEntityTranslations('product', id, {
            en: { fields: { title: 'Bed' } },
            it: { fields: { title: 'Cuccia' } }
        });

        const result = await localeService.getEntityTranslations('product', id);

        expect(result.data?.translations.map((row) => row.locale)).toEqual(['en', 'it']);
    });
});

describe('upsertEntityTranslations', () => {
    it('refuses an unregistered entityType', async () => {
        const result = await localeService.upsertEntityTranslations('bogus', 'p1', {
            en: { fields: { title: 'Bed' } }
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(422);
    });

    it('refuses a locale that does not exist', async () => {
        const product = await createProduct();

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                xx: { fields: { title: 'Bed' } }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses a locale that is not active', async () => {
        const product = await createProduct();
        await givenLocale('it', { active: false });

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                it: { fields: { title: 'Cuccia' } }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses a field the registry does not declare for this entityType', async () => {
        const product = await createProduct();

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                [FALLBACK]: { fields: { title: 'Bed', price: '24.90' } }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses an empty fields object rather than treating it as a delete', async () => {
        const product = await createProduct();

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                [FALLBACK]: { fields: {} }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses null on the fallback locale', async () => {
        const product = await createProduct();

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                [FALLBACK]: null
            }
        );

        expect(result.status).toBe(422);
    });

    it('deletes a non-fallback locale row on null', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await localeService.upsertEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const result = await localeService.upsertEntityTranslations('product', id, { it: null });

        expect(result.success).toBe(true);
        expect(result.data?.translations.map((row) => row.locale)).toEqual([]);
    });

    it('leaves an existing locale untouched when the body does not name it', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Bed' } },
            it: { fields: { title: 'Cuccia' } }
        });

        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Bed, new' } }
        });

        const result = await localeService.getEntityTranslations('product', id);
        const it = result.data?.translations.find((row) => row.locale === 'it');
        expect(it?.fields.title).toBe('Cuccia');
    });

    it('validates the whole batch before writing anything', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');

        const result = await localeService.upsertEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } },
            xx: { fields: { title: 'Bed' } } // unregistered locale — the whole batch must fail
        });

        expect(result.status).toBe(422);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows).toEqual([]);
    });

    it('writes the derived index column when the fallback locale is written, and nothing else', async () => {
        const product = await createProduct({ title: 'Old title' });
        const id = String(product._id);
        await givenLocale('it');

        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'New title', description: 'New description' } },
            it: { fields: { title: 'Titolo nuovo' } }
        });

        const stored = await productRepository.findById(id);
        expect(stored?.title).toBe('New title');
        expect(stored?.description).toBe('New description');
    });

    it('does not touch the derived index column for a non-fallback locale', async () => {
        const product = await createProduct({ title: 'Untouched' });
        const id = String(product._id);
        await givenLocale('it');

        await localeService.upsertEntityTranslations('product', id, {
            it: { fields: { title: 'Titolo' } }
        });

        const stored = await productRepository.findById(id);
        expect(stored?.title).toBe('Untouched');
    });

    it('stamps a non-fallback row with a digest of the fallback row, and omits it on the fallback row itself', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');

        // The fallback row has to already exist for there to be anything to digest against — in
        // real use it always does, written by `productService.create` before a translator ever
        // opens this door. Two requests here for the same reason.
        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Bed' } }
        });
        await localeService.upsertEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const rows = await translationRepository.findEntityTranslations('product', id);
        const fallbackRow = rows.find((row) => row.locale === FALLBACK);
        const itRow = rows.find((row) => row.locale === 'it');

        expect(fallbackRow?.sourceDigest).toBeUndefined();
        expect(itRow?.sourceDigest).toBeDefined();
    });

    it('does not re-stamp a sibling row when the fallback locale is rewritten in a later request', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Bed' } }
        });
        await localeService.upsertEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        const rowsBefore = await translationRepository.findEntityTranslations('product', id);
        const digestBefore = rowsBefore.find((row) => row.locale === 'it')?.sourceDigest;

        // The source changes, in its OWN request — the Italian row is not named here at all.
        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Bed, revised' } }
        });

        const rowsAfter = await translationRepository.findEntityTranslations('product', id);
        const digestAfter = rowsAfter.find((row) => row.locale === 'it')?.sourceDigest;
        expect(digestAfter).toBe(digestBefore);
    });

    it('defaults origin to human', async () => {
        const product = await createProduct();
        const id = String(product._id);

        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Bed' } }
        });

        const [row] = await translationRepository.findEntityTranslations('product', id);
        expect(row.origin).toBe('human');
    });
});
