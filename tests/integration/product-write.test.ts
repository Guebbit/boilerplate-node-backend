/**
 * `productService.create` / `updateById` — the multilingual product write surface, driven
 * against a real database and a real translation port. Cross-module by nature: the trigger is
 * `productService.create` / `updateById`, the rows and the locale check live in
 * `locales/repository.ts`, so this lives at the top level rather than under either module's own `tests/`.
 *
 * The WIRING half (a write calls the port) and the STORAGE half (the port's own collection holds
 * up) are each proven with a fake stand-in for the other module instead — `products`' and
 * `locales`' own `tests/integration/` — so only this real-database, both-sides case lives here.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { createProduct, readProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import type { ProductDocument } from '@modules/products';
import { deriveSourceDigest, translationRepository } from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';
import { registerModules } from '@kernel/registry';
import localesModule from '@modules/locales/module';
import productsModule from '@modules/products/module';

setupTestDb();

/**
 * `registerModules` runs locales' `onRegistered`, which resolves `translatables` off every
 * registered module's own manifest — `productsModule` declares `product` there, so registering
 * both is what installs the translation port `products` writes through.
 */
beforeAll(() => registerModules([localesModule, productsModule]));

/** `en` is the default language in every environment this suite runs in — see `.env-example`. */
const DEFAULT_LANGUAGE = 'en';

/** The default language is registered and active in every case, as in a real deployment. */
beforeEach(async () => {
    await givenLocale(DEFAULT_LANGUAGE);
});

describe('productService.create', () => {
    it('writes the product with its own text, and a row for every other language, in one operation', async () => {
        await givenLocale('it');

        const result = await productService.create(
            productService.zodProductCreateSchema.parse({
                price: '24.90',
                title: 'Memory Foam Bed',
                description: 'Extra support',
                translations: { it: { title: 'Cuccia in memory foam' } }
            }),
            testCallerContext
        );

        expect(result.success).toBe(true);
        const created = (result as { data: ProductDocument }).data;

        // The default language is the product's own text, never a row.
        const rows = await translationRepository.findEntityTranslations('product', created.id);
        expect(rows.map((row) => row.locale)).toEqual(['it']);
        expect(created.title).toBe('Memory Foam Bed');
        expect(created.description).toBe('Extra support');
        expect(rows[0].sourceDigest).toBe(
            deriveSourceDigest({ title: 'Memory Foam Bed', description: 'Extra support' })
        );
    });

    it('creates a product with no translations at all', async () => {
        const result = await productService.create(
            productService.zodProductCreateSchema.parse({ price: '10.00', title: 'Valid title' }),
            testCallerContext
        );

        expect(result.success).toBe(true);
        const created = (result as { data: ProductDocument }).data;
        expect(await translationRepository.findEntityTranslations('product', created.id)).toEqual(
            []
        );
    });

    it('rejects the default language as a translation, and writes nothing', async () => {
        const before = await productService.search({}, undefined);

        const result = await productService.create(
            productService.zodProductCreateSchema.parse({
                price: '10.00',
                title: 'Valid title',
                translations: { en: { title: 'Valid title again' } }
            }),
            testCallerContext
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.errors.some((error) => error.details?.field === 'translations.en')).toBe(
            true
        );
        const after = await productService.search({}, undefined);
        expect(after.items).toHaveLength(before.items.length);
    });

    it('rejects, and writes nothing, when a translation locale does not exist', async () => {
        const before = await productService.search({}, undefined);

        const result = await productService.create(
            productService.zodProductCreateSchema.parse({
                price: '10.00',
                title: 'Valid title',
                translations: { xx: { title: 'Unregistered' } }
            }),
            testCallerContext
        );

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.errors.some((error) => error.details?.field === 'translations.xx')).toBe(
            true
        );

        const after = await productService.search({}, undefined);
        expect(after.items).toHaveLength(before.items.length);
    });
});

describe('productService.updateById', () => {
    it('applies an edit and a deletion from the same PATCH, or neither', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Bed' });
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'it',
            { title: 'Cuccia' },
            'human',
            undefined,
            'digest'
        );

        const result = await productService.updateById(
            id,
            { title: 'Bed, revised', translations: { it: null } },
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect(await translationRepository.findEntityTranslations('product', id)).toEqual([]);
        const stored = await readProduct(id);
        expect(stored?.title).toBe('Bed, revised');
    });

    it('rejects the default language, null included, and leaves the product and every row untouched', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Bed' });
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'it',
            { title: 'Cuccia' },
            'human',
            undefined,
            'digest'
        );

        const result = await productService.updateById(
            id,
            { title: 'Bed, revised', translations: { en: null } },
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect(await translationRepository.findEntityTranslations('product', id)).toHaveLength(1);
        const stored = await readProduct(id);
        expect(stored?.title).toBe('Bed');
    });

    it('stamps rows written beside a new title with the new text, and leaves the others outdated', async () => {
        await givenLocale('it');
        await givenLocale('de');
        const product = await createProduct({ title: 'Bed' });
        const id = String(product._id);
        const stale = deriveSourceDigest({ title: 'Bed' });
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'de',
            { title: 'Korb' },
            'human',
            undefined,
            stale
        );

        await productService.updateById(
            id,
            { title: 'Bed, revised', translations: { it: { title: 'Cuccia' } } },
            testCallerContext
        );

        const rows = await translationRepository.findEntityTranslations('product', id);
        const digestOf = Object.fromEntries(rows.map((row) => [row.locale, row.sourceDigest]));
        expect(digestOf).toEqual({ de: stale, it: deriveSourceDigest({ title: 'Bed, revised' }) });
    });

    it('keeps a row outdated when a save re-sends its text unchanged beside a new title', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Bed' });
        const id = String(product._id);
        await productService.updateById(
            id,
            { translations: { it: { title: 'Cuccia' } } },
            testCallerContext
        );

        await productService.updateById(
            id,
            { title: 'Bed, revised', translations: { it: { title: 'Cuccia' } } },
            testCallerContext
        );

        const [row] = await translationRepository.findEntityTranslations('product', id);
        expect(row.sourceDigest).toBe(deriveSourceDigest({ title: 'Bed' }));
    });

    it('clears the default description on null', async () => {
        const product = await createProduct({ title: 'Bed', description: 'Soft' });
        const id = String(product._id);

        await productService.updateById(id, { description: null }, testCallerContext);

        const stored = await readProduct(id);
        expect(stored?.description).toBeUndefined();
    });

    it('leaves translations alone entirely when the PATCH carries none', async () => {
        await givenLocale('it');
        const product = await createProduct({ title: 'Bed', price: '10.00' });
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'it',
            { title: 'Cuccia' },
            'human',
            undefined,
            undefined
        );

        const result = await productService.updateById(id, { price: '25.00' }, testCallerContext);

        expect(result.success).toBe(true);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows).toHaveLength(1);
        expect(rows[0].fields.title).toBe('Cuccia');
    });
});
