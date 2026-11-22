/**
 * @module
 * `products` with the `locales` module absent. No `registerModules` call in this file installs a
 * translation port, and `registerTranslationPort` is reset explicitly rather than relying on
 * module isolation, so this suite proves the same behaviour a deployment sees when `locales` is
 * genuinely uninstalled: the default language still writes and reads, and any translation
 * 422s rather than a 500 from a missing port — `kernel/translation.ts`'s fallback answers it.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs, testCallerContext } from '@tests/callers';
import { runWithLocale } from '@infrastructure/i18n';
import { registerTranslationPort } from '@kernel/translation';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '../../services';
import type { ResponseReject, ResponseSuccess } from '@infrastructure/http/response';
import type { ProductDocument } from '../../model';

setupTestDb();

/* No provider for the whole suite — the one thing this file is testing. */
beforeEach(() => registerTranslationPort(undefined));

describe('productService.create — no translation provider', () => {
    it('writes the default language alone', async () => {
        const result = await productService.create(
            productService.zodProductCreateSchema.parse({
                price: '12.50',
                title: 'Standing Desk'
            }),
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<ProductDocument>).data.title).toBe('Standing Desk');
    });

    it('refuses a second language with a field-named 422, not a 500', async () => {
        const result = await productService.create(
            productService.zodProductCreateSchema.parse({
                price: '12.50',
                title: 'Standing Desk',
                translations: { it: { title: 'Scrivania' } }
            }),
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
        expect((result as ResponseReject).errors[0]?.details?.field).toBe('translations.it');
    });
});

describe('productService.updateById — no translation provider', () => {
    it.each([
        ['it', 'a language other than the default'],
        ['en', 'the default language']
    ])('refuses a PATCH naming %s, %s, with a field-named 422', async (locale) => {
        const product = await createProduct({ title: 'Bookshelf' });

        const result = await productService.updateById(
            product.id,
            { translations: { [locale]: { title: 'Libreria' } } },
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
        expect((result as ResponseReject).errors[0]?.details?.field).toBe(`translations.${locale}`);
    });
});

describe('productService.getByIdForCaller — no translation provider', () => {
    it('answers the product’s own columns as the source, and no other language', async () => {
        const product = await createProduct({ title: 'Bookshelf', description: 'Oak, 5 shelves' });

        const admin = await productService.getByIdForCaller(
            product.id,
            undefined,
            callerContextAs('admin')
        );

        expect(admin?.source).toEqual({ title: 'Bookshelf', description: 'Oak, 5 shelves' });
        expect(admin?.translations).toEqual({});
    });
});

describe('productService.getById — no translation provider', () => {
    it('answers the fallback title regardless of the requested language', async () => {
        const product = await createProduct({ title: 'Bookshelf' });

        const read = await runWithLocale('it', () => productService.getById(product.id));

        expect(read?.title).toBe('Bookshelf');
    });
});
