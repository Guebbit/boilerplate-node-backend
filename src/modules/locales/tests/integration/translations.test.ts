/**
 * @module
 * `getEntityTranslations` / `upsertEntityTranslations` — the translator's door, driven against a
 * real database. Every property here needs Mongo: the registry lookup, the `locales` collection
 * check, the derived-index-column write on `products`, and the digest a sibling row is stamped
 * with.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct, readProduct } from '@modules/products/tests/factories';
import {
    deriveSourceDigest,
    localeRepository,
    translationRepository
} from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';
import { localeService } from '@modules/locales/services';
import { resolveTranslatables } from '@kernel/registry';
import { enabledModules } from '../../../../modules';

setupTestDb();

beforeAll(() => {
    // The real registered target, not a hand-rolled duplicate — `writeDerived` is products' own
    // repository method, and a locales test importing that repository directly is exactly the
    // hidden cross-module coupling `tests/cross-cutting/translatable-targets.test.ts` guards against
    // (it resolves the same way).
    localeService.setTranslatables(resolveTranslatables(enabledModules));
});

afterAll(() => {
    localeService.setTranslatables({});
});

/** `en` is the fallback locale in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

// Every case below writes the fallback locale at least once — it is a row like any other, no
// special case, so the write path checks it exists and is active exactly as it would any other.
beforeEach(async () => {
    await givenLocale(FALLBACK);
});

describe('getEntityTranslations', () => {
    it('refuses an unregistered entityType', async () => {
        const result = await localeService.getEntityTranslations('bogus', 'p1');

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
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
            en: { fields: { title: 'Cozy Bed' } },
            it: { fields: { title: 'Cuccia' } }
        });

        const result = await localeService.getEntityTranslations('product', id);

        expect(result.data?.translations.map((row) => row.locale)).toEqual(['en', 'it']);
    });
});

describe('upsertEntityTranslations', () => {
    it('refuses an unregistered entityType', async () => {
        const result = await localeService.upsertEntityTranslations('bogus', 'p1', {
            en: { fields: { title: 'Cozy Bed' } }
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('refuses a locale that does not exist', async () => {
        const product = await createProduct();

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                xx: { fields: { title: 'Cozy Bed' } }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses a nonexistent entity with 404, writing no rows', async () => {
        const missingId = new Types.ObjectId().toString();

        const result = await localeService.upsertEntityTranslations('product', missingId, {
            [FALLBACK]: { fields: { title: 'Cozy Bed' } }
        });

        expect(result.status).toBe(404);
        const rows = await translationRepository.findEntityTranslations('product', missingId);
        expect(rows).toEqual([]);
    });

    it('rejects rather than writing anything for a malformed entity id', async () => {
        // `target.exists` throws the same `BSONError` `toObjectId` always does on a bad id
        // (`create-repository.ts`) — the controller's `catchAs` turns it into a 422. The property
        // under test here is the ORDER: the rejection must land before any row is written.
        const malformedId = 'not-an-object-id';

        await expect(
            localeService.upsertEntityTranslations('product', malformedId, {
                [FALLBACK]: { fields: { title: 'Cozy Bed' } }
            })
        ).rejects.toThrow();

        const rows = await translationRepository.findEntityTranslations('product', malformedId);
        expect(rows).toEqual([]);
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

    it('writes the fallback locale even with no locale row for it', async () => {
        const product = await createProduct();

        // The fallback can't be deleted or deactivated, so writing it needs no `locales` row at
        // all — remove the one `beforeEach` seeded to prove the write path doesn't look it up.
        const fallbackRow = await localeRepository.findOne({ tag: FALLBACK });
        if (fallbackRow) await localeRepository.deleteOne(fallbackRow);

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                [FALLBACK]: { fields: { title: 'Kennel' } }
            }
        );

        expect(result.success).toBe(true);
    });

    it('refuses a field the registry does not declare for this entityType', async () => {
        const product = await createProduct();

        const result = await localeService.upsertEntityTranslations(
            'product',
            String(product._id),
            {
                [FALLBACK]: { fields: { title: 'Cozy Bed', price: '24.90' } }
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
            [FALLBACK]: { fields: { title: 'Cozy Bed' } },
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
            xx: { fields: { title: 'Cozy Bed' } } // unregistered locale — the whole batch must fail
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

        const stored = await readProduct(id);
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

        const stored = await readProduct(id);
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
            [FALLBACK]: { fields: { title: 'Cozy Bed' } }
        });
        await localeService.upsertEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const rows = await translationRepository.findEntityTranslations('product', id);
        const fallbackRow = rows.find((row) => row.locale === FALLBACK);
        const itRow = rows.find((row) => row.locale === 'it');

        expect(fallbackRow?.sourceDigest).toBeUndefined();
        // A digest OF THE FALLBACK ROW, not merely some digest.
        expect(itRow?.sourceDigest).toBe(deriveSourceDigest({ title: 'Cozy Bed' }));
    });

    it('does not re-stamp a sibling row when the fallback locale is rewritten in a later request', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Cozy Bed' } }
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
            [FALLBACK]: { fields: { title: 'Cozy Bed' } }
        });

        const [row] = await translationRepository.findEntityTranslations('product', id);
        expect(row.origin).toBe('human');
    });
});

/** A product with a fallback row carrying both fields, and the columns mirroring it. */
const seededProduct = async () => {
    const product = await createProduct({ title: 'Old title', description: 'Old words' });
    const id = String(product._id);
    await localeService.upsertEntityTranslations('product', id, {
        [FALLBACK]: { fields: { title: 'Cozy Bed', description: 'Extra support' } }
    });
    return id;
};

describe('upsertEntityTranslations, field by field (RFC 7396)', () => {
    it('changes only the field named, and keeps the row and the column of the others', async () => {
        const id = await seededProduct();

        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Cozy Bed XL' } }
        });

        const row = await translationRepository.findEntityLocale('product', id, FALLBACK);
        expect(row?.fields).toEqual({ title: 'Cozy Bed XL', description: 'Extra support' });
        const stored = await readProduct(id);
        expect(stored?.title).toBe('Cozy Bed XL');
        expect(stored?.description).toBe('Extra support');
    });

    it('clears one field on null, and the mirrored column with it', async () => {
        const id = await seededProduct();

        const result = await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { description: null } }
        });

        expect(result.success).toBe(true);
        const row = await translationRepository.findEntityLocale('product', id, FALLBACK);
        expect(row?.fields).toEqual({ title: 'Cozy Bed' });
        const stored = await readProduct(id);
        expect(stored?.description).toBe('');
    });

    it('refuses a value the product itself would refuse, naming the locale and field', async () => {
        const id = await seededProduct();

        const result = await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'abc' } }
        });

        expect(result.status).toBe(422);
        expect(result.errors?.[0]?.details).toEqual({ field: `${FALLBACK}.title` });
        const stored = await readProduct(id);
        expect(stored?.title).toBe('Cozy Bed');
    });

    it.each([
        ['an empty description', { description: '' }],
        ['a cleared title', { title: null }]
    ])('refuses %s — a description is cleared with null, a title never', async (_label, fields) => {
        const id = await seededProduct();

        const result = await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields }
        });

        expect(result.status).toBe(422);
        const row = await translationRepository.findEntityLocale('product', id, FALLBACK);
        expect(row?.fields).toEqual({ title: 'Cozy Bed', description: 'Extra support' });
    });
});

describe('replaceEntityTranslations', () => {
    it('refuses a nonexistent entity with 404, writing no rows', async () => {
        const missingId = new Types.ObjectId().toString();

        const result = await localeService.replaceEntityTranslations('product', missingId, {
            [FALLBACK]: { fields: { title: 'Cozy Bed' } }
        });

        expect(result.status).toBe(404);
        const rows = await translationRepository.findEntityTranslations('product', missingId);
        expect(rows).toEqual([]);
    });

    it('clears a declared field a sent locale leaves out — a PUT states the locale whole', async () => {
        const product = await createProduct({ title: 'Old title', description: 'Old words' });
        const id = String(product._id);
        await localeService.upsertEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Cozy Bed', description: 'Extra support' } }
        });

        const result = await localeService.replaceEntityTranslations('product', id, {
            [FALLBACK]: { fields: { title: 'Cozy Bed XL' } }
        });

        expect(result.success).toBe(true);
        const row = await translationRepository.findEntityLocale('product', id, FALLBACK);
        expect(row?.fields).toEqual({ title: 'Cozy Bed XL' });
        const stored = await readProduct(id);
        expect(stored?.description).toBe('');
    });

    it('still refuses an empty fields object instead of clearing everything', async () => {
        const product = await createProduct({ title: 'Old title' });

        const result = await localeService.replaceEntityTranslations(
            'product',
            String(product._id),
            { [FALLBACK]: { fields: {} } }
        );

        expect(result.status).toBe(422);
    });
});
