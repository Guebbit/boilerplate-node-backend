/**
 * Nothing outlives what it describes: a translation row is meaningless once its product is gone.
 *
 * Cross-module by nature — the trigger is `productService.remove`, the rows live in
 * `locales/repository.ts` — so this lives at the top level rather than under either module's
 * `tests/`, the same way `docs/reference/tests.md` puts a system-wide property outside any one
 * module's own suite.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { productService } from '@modules/products';
import { translationRepository } from '@modules/locales/repository';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../../src/modules';

setupTestDb();

/*
 * Neither module is reached through `src/app.ts` here, so the registry's own boot-time wiring
 * never ran — `locales/module.ts` registers the translation port at IMPORT time, which is what
 * `productService.remove`'s hard-delete branch calls through `removeTranslations`. Importing
 * `enabledModules` (and running it through `registerModules`, the same as `app.ts` does) is what
 * makes that import actually happen.
 */
beforeAll(() => {
    registerModules(enabledModules);
});

describe('a product taking its translations with it', () => {
    it('a hard delete removes every locale row, in the same operation', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'en',
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

        const result = await productService.remove(product, true);

        expect(result.success).toBe(true);
        expect(await translationRepository.findEntityTranslations('product', id)).toEqual([]);
    });

    it('a soft delete keeps every locale row', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'en',
            { title: 'Bed' },
            'human',
            undefined,
            undefined
        );

        const result = await productService.remove(product, false);

        expect(result.success).toBe(true);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows.map((row) => row.locale)).toEqual(['en']);
    });

    it('a restore — soft delete run again — still has every language', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'en',
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

        // The flip: soft-delete, then soft-delete again to restore.
        await productService.remove(product, false);
        const restored = await productService.remove(product, false);

        expect(restored.success).toBe(true);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows.map((row) => row.locale).toSorted()).toEqual(['en', 'it']);
    });

    it('leaves another product’s translations standing', async () => {
        const doomed = await createProduct();
        const survivor = await createProduct();
        await translationRepository.upsertEntityLocale(
            'product',
            String(doomed._id),
            'en',
            { title: 'Doomed' },
            'human',
            undefined,
            undefined
        );
        await translationRepository.upsertEntityLocale(
            'product',
            String(survivor._id),
            'en',
            { title: 'Survivor' },
            'human',
            undefined,
            undefined
        );

        await productService.remove(doomed, true);

        const rows = await translationRepository.findEntityTranslations(
            'product',
            String(survivor._id)
        );
        expect(rows).toHaveLength(1);
    });
});
