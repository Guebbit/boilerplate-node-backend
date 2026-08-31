/**
 * @module
 * This module's validation copy resolves against the active locale — the same property
 * `modules/users` documents in full, applied here to the catalogue's own schema and thunks.
 */

import { loadBeforeI18n, mergedResources } from '@tests/i18n-boot';

const copy = (locale: 'en' | 'it') =>
    (mergedResources()[locale].translation as { products: Record<string, string> }).products;

describe('product validation messages', () => {
    it('uses the Italian copy verbatim, not a Zod default', async () => {
        const { zodProductSchema } = await loadBeforeI18n(
            'it',
            () => import('@modules/products/model'),
            'products.field-title-min'
        );

        const result = zodProductSchema.safeParse({ title: 'ab', price: -1 });
        expect(result.success).toBe(false);

        const messages = result.error?.issues.map(({ message }) => message) ?? [];
        const it = copy('it');

        expect(messages).toContain(it['field-title-min']);
        expect(messages).toContain(it['field-price-min']);
    });
});
