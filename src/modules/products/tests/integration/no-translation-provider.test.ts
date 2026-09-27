/**
 * @module
 * `products` with the `locales` module absent — LOCALES_OPTIONAL_0925 step 3c. No
 * `registerModules` call in this file installs a translation port, and `registerTranslationPort`
 * is reset explicitly rather than relying on module isolation, so this suite proves the same
 * behaviour a deployment sees when `locales` is genuinely uninstalled: the fallback language
 * still writes and reads, and any other language 422s rather than the 500 a missing port used to
 * throw before `kernel/translation.ts`'s fallback (LOCALES_OPTIONAL step 3a).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/callers';
import { runWithLocale } from '@infrastructure/i18n';
import { registerTranslationPort } from '@kernel/translation';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '../../service';
import type { ResponseReject, ResponseSuccess } from '@infrastructure/http/response';
import type { ProductDocument } from '../../model';

setupTestDb();

/* No provider for the whole suite — the one thing this file is testing. */
beforeEach(() => registerTranslationPort(undefined));

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

describe('productService.writeCreate — no translation provider', () => {
    it('writes the fallback language alone', async () => {
        const result = await productService.writeCreate(
            { price: 12.5, translations: { [FALLBACK]: { title: 'Standing Desk' } } },
            testCallerContext
        );

        expect(result.success).toBe(true);
        expect((result as ResponseSuccess<ProductDocument>).data.title).toBe('Standing Desk');
    });

    it('refuses a second language with a field-named 422, not a 500', async () => {
        const result = await productService.writeCreate(
            {
                price: 12.5,
                translations: {
                    [FALLBACK]: { title: 'Standing Desk' },
                    it: { title: 'Scrivania' }
                }
            },
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
        expect((result as ResponseReject).errors[0]?.details?.field).toBe('translations.it');
    });
});

describe('productService.writeUpdate — no translation provider', () => {
    it('refuses a PATCH naming only a language that is not the fallback', async () => {
        const product = await createProduct({ title: 'Bookshelf' });

        const result = await productService.writeUpdate(
            product.id,
            { translations: { it: { title: 'Libreria' } } },
            testCallerContext
        );

        expect(result.success).toBe(false);
        expect((result as ResponseReject).status).toBe(422);
        expect((result as ResponseReject).errors[0]?.details?.field).toBe('translations.it');
    });
});

describe('productService.getAdmin — no translation provider', () => {
    it('builds the fallback tab from the product’s own columns', async () => {
        const product = await createProduct({ title: 'Bookshelf', description: 'Oak, 5 shelves' });

        const admin = await productService.getAdmin(product.id);

        expect(admin?.translations).toEqual({
            [FALLBACK]: { title: 'Bookshelf', description: 'Oak, 5 shelves' }
        });
    });
});

describe('productService.getById — no translation provider', () => {
    it('answers the fallback title regardless of the requested language', async () => {
        const product = await createProduct({ title: 'Bookshelf' });

        const read = await runWithLocale('it', () => productService.getById(product.id));

        expect(read?.title).toBe('Bookshelf');
    });
});
