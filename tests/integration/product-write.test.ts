/**
 * `productService.writeCreate` / `writeUpdate` — the multilingual product write surface, driven
 * against a real database and a real translation port. Cross-module by nature, the same way
 * `translation-cascades.test.ts` is: the trigger is `productService.write*`, the rows and the
 * locale check live in `locales/repository.ts`, so this lives at the top level rather than under
 * either module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createProduct } from '@modules/products/tests/fixtures';
import { productService } from '@modules/products';
import { productRepository } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import { translationRepository, localeRepository } from '@modules/locales/repository';
import { makeLocale } from '@modules/locales/fixtures';
import { localeService } from '@modules/locales/services';
import { enabledModules } from '../../src/modules';

setupTestDb();

beforeAll(() => {
    // Importing the module list runs `locales/module.ts`'s import-time `registerTranslationPort`
    // — the only legal way `products` reaches translation data, per the module boundary.
    void enabledModules;
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

// Every case below writes the fallback locale at least once — see the same note in
// `locales/tests/integration/translations.test.ts`.
beforeEach(async () => {
    await givenLocale(FALLBACK);
});

describe('productService.writeCreate', () => {
    it('writes the product and every translation row in one operation', async () => {
        await givenLocale('it');

        const result = await productService.writeCreate(
            {
                price: 24.9,
                translations: {
                    en: { title: 'Memory Foam Bed', description: 'Extra support' },
                    it: { title: 'Cuccia in memory foam' }
                }
            },
            testCallerContext
        );

        expect(result.success).toBe(true);
        const created = (result as { data: ProductDocument }).data;

        const rows = await translationRepository.findEntityTranslations('product', created.id);
        expect(rows.map((row) => row.locale)).toEqual(['en', 'it']);
        // The fallback row is also the derived index column on the product document itself.
        expect(created.title).toBe('Memory Foam Bed');
    });

    it('rejects, and writes neither the product nor a translation row, when the fallback locale is missing', async () => {
        const before = await productRepository.search({}, undefined);

        const result = await productService.writeCreate(
            { price: 10, translations: { it: { title: 'Solo italiano' } } },
            testCallerContext
        );

        expect(result.success).toBe(false);

        const after = await productRepository.search({}, undefined);
        expect(after.items).toHaveLength(before.items.length);
    });

    it('rejects, and writes nothing, when a translation locale does not exist', async () => {
        const before = await productRepository.search({}, undefined);

        const result = await productService.writeCreate(
            {
                price: 10,
                translations: { en: { title: 'Valid title' }, xx: { title: 'Unregistered' } }
            },
            testCallerContext
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.errors.some((error) => error.details?.field === 'translations.xx')).toBe(
            true
        );

        const after = await productRepository.search({}, undefined);
        expect(after.items).toHaveLength(before.items.length);
    });
});

describe('productService.writeUpdate', () => {
    it('applies an edit and a deletion from the same PATCH, or neither', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Bed' });
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            FALLBACK,
            { title: 'Bed' },
            'human',
            undefined,
            undefined
        );
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'it',
            { title: 'Cuccia' },
            'human',
            undefined,
            'digest'
        );

        const result = await productService.writeUpdate(
            id,
            { translations: { en: { title: 'Bed, revised' }, it: null } },
            testCallerContext
        );

        expect(result.success).toBe(true);

        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows.map((row) => row.locale)).toEqual(['en']);
        expect(rows[0].fields.title).toBe('Bed, revised');
    });

    it('rejects null on the fallback locale and leaves every row untouched', async () => {
        const product = await createProduct({ title: 'Bed' });
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            FALLBACK,
            { title: 'Bed' },
            'human',
            undefined,
            undefined
        );

        const result = await productService.writeUpdate(
            id,
            { translations: { en: null } },
            testCallerContext
        );

        expect(result.success).toBe(false);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows).toHaveLength(1);
    });

    it('leaves translations alone entirely when the PATCH carries none', async () => {
        const product = await createProduct({ title: 'Bed', price: 10 });
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            FALLBACK,
            { title: 'Bed' },
            'human',
            undefined,
            undefined
        );

        const result = await productService.writeUpdate(id, { price: 25 }, testCallerContext);

        expect(result.success).toBe(true);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows).toHaveLength(1);
        expect(rows[0].fields.title).toBe('Bed');
    });
});
