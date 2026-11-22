/**
 * @module
 * `getEntityTranslations` / `updateEntityTranslations` — the translator's door, driven against a
 * real database. Every property here needs Mongo: the registry lookup, the `locales` collection
 * check, the entity's own text read for the digest a row is stamped with, and the default language
 * every lookup leaves out.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct, readProduct, saveProduct } from '@modules/products/tests/factories';
import {
    deriveSourceDigest,
    localeRepository,
    translationRepository
} from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';
import { localeModel } from '@modules/locales/model';
import { localeService } from '@modules/locales/services';
import { resolveTranslatables } from '@kernel/registry';
import { enabledModules } from '../../../../modules';

setupTestDb();

beforeAll(() => {
    /**
     * The real registered target, not a hand-rolled duplicate — `sourceOf` is products' own
     * repository method, and a locales test importing that repository directly is exactly the
     * hidden cross-module coupling `tests/cross-cutting/translatable-targets.test.ts` guards against
     * (it resolves the same way).
     */
    localeService.setTranslatables(resolveTranslatables(enabledModules));
});

afterAll(() => {
    localeService.setTranslatables({});
});

/** `en` is the default language in every environment this suite runs in — see `.env-example`. */
const FALLBACK = 'en';

/**
 * A row in the default language, written straight at the repository: what an old write, or a
 * changed `NODE_FALLBACK_LOCALE`, leaves behind. The service refuses to write one.
 */
const leftoverDefaultRow = (id: string, fields: Record<string, string>) =>
    translationRepository.upsertEntityLocale(
        'product',
        id,
        FALLBACK,
        fields,
        'human',
        undefined,
        undefined
    );

/** The default language is registered and active in every case, as in a real deployment. */
beforeEach(async () => {
    await givenLocale(FALLBACK);
});

describe('getEntityTranslations', () => {
    it('refuses an unregistered entityType', async () => {
        const result = await localeService.getEntityTranslations('bogus', 'p1');

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('answers the entity’s own text as the source, and an empty list for an entity with no rows', async () => {
        const product = await createProduct({ title: 'Cozy Bed', description: 'Extra support' });

        const result = await localeService.getEntityTranslations('product', String(product._id));

        expect(result.success).toBe(true);
        expect(result.data?.translations).toEqual([]);
        expect(result.data?.source).toEqual({
            fields: { title: 'Cozy Bed', description: 'Extra support' },
            digest: deriveSourceDigest({ title: 'Cozy Bed', description: 'Extra support' })
        });
    });

    it('answers 404 for an entity that does not exist', async () => {
        const result = await localeService.getEntityTranslations(
            'product',
            String(new Types.ObjectId())
        );

        expect(result.status).toBe(404);
    });

    it('lists every other language, sorted by locale, and never a row in the default one', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await givenLocale('de');
        await leftoverDefaultRow(id, { title: 'Stale default' });
        // Written in neither alphabetical nor reverse order, so only a real sort puts them right.
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } },
            de: { fields: { title: 'Hundekorb' } }
        });

        const result = await localeService.getEntityTranslations('product', id);

        expect(result.data?.translations.map((row) => row.locale)).toEqual(['de', 'it']);
    });

    it('flags a row outdated once the entity’s own text changes, and not before', async () => {
        const product = await createProduct({ title: 'Cozy Bed' });
        const id = String(product._id);
        await givenLocale('it');
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const fresh = await localeService.getEntityTranslations('product', id);
        expect(fresh.data?.translations.map((row) => row.outdated)).toEqual([false]);

        const stored = await readProduct(id);
        if (!stored) throw new Error('the product was just created');
        stored.title = 'Cozy Bed, revised';
        await saveProduct(stored);

        const stale = await localeService.getEntityTranslations('product', id);
        expect(stale.data?.translations.map((row) => row.outdated)).toEqual([true]);
        expect(stale.data?.source.digest).toBe(deriveSourceDigest({ title: 'Cozy Bed, revised' }));
    });
});

describe('updateEntityTranslations', () => {
    it('refuses an unregistered entityType', async () => {
        const result = await localeService.updateEntityTranslations('bogus', 'p1', {
            en: { fields: { title: 'Cozy Bed' } }
        });

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
    });

    it('refuses a locale that does not exist', async () => {
        const product = await createProduct();

        const result = await localeService.updateEntityTranslations(
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
        await givenLocale('it');

        const result = await localeService.updateEntityTranslations('product', missingId, {
            it: { fields: { title: 'Cuccia' } }
        });

        expect(result.status).toBe(404);
        const rows = await translationRepository.findEntityTranslations('product', missingId);
        expect(rows).toEqual([]);
    });

    it('rejects rather than writing anything for a malformed entity id', async () => {
        /**
         * `target.revisionOf` throws the same `BSONError` `toObjectId` always does on a bad id
         * (`create-repository.ts`) — the controller's `catchAs` turns it into a 422. The property
         * under test here is the ORDER: the rejection must land before any row is written.
         */
        const malformedId = 'not-an-object-id';
        await givenLocale('it');

        await expect(
            localeService.updateEntityTranslations('product', malformedId, {
                it: { fields: { title: 'Cuccia' } }
            })
        ).rejects.toThrow();

        const rows = await translationRepository.findEntityTranslations('product', malformedId);
        expect(rows).toEqual([]);
    });

    it('writes no row when the tag bump fails, since the two share one transaction', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        const real = resolveTranslatables(enabledModules);
        const realProduct = real.product;
        if (!realProduct) throw new Error('the product translatable target is not registered');
        localeService.setTranslatables({
            ...real,
            product: {
                ...realProduct,
                markEdited: () => Promise.reject(new Error('tag bump failed'))
            }
        });

        await expect(
            localeService.updateEntityTranslations('product', id, {
                it: { fields: { title: 'Cuccia' } }
            })
        ).rejects.toThrow('tag bump failed');

        expect(await translationRepository.findEntityTranslations('product', id)).toEqual([]);
        localeService.setTranslatables(real);
    });

    it('drafts content in a locale that is not active, and the editor lists it', async () => {
        const product = await createProduct();
        await givenLocale('it', { active: false });

        const result = await localeService.updateEntityTranslations(
            'product',
            String(product._id),
            {
                it: { fields: { title: 'Cuccia' } }
            }
        );

        expect(result.success).toBe(true);
        expect(result.data?.translations.map((row) => row.locale)).toEqual(['it']);
    });

    it('does not serve a draft locale’s text, nor find a product through it', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it', { active: false });
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const resolved = await translationRepository.resolveEntityFields('product', [id], ['it']);
        const found = await translationRepository.findEntityIdsByFieldMatch(
            'product',
            ['title'],
            'Cuccia',
            ['it']
        );

        expect(resolved.size).toBe(0);
        expect(found).toEqual([]);
    });

    // A staff preview names the one draft tag it may read; without the tag the draft is dropped.
    it('serves a draft’s text, and finds a product through it, only for the tag a preview names', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it', { active: false });
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const previewed = await translationRepository.resolveEntityFields(
            'product',
            [id],
            ['it'],
            'it'
        );
        const found = await translationRepository.findEntityIdsByFieldMatch(
            'product',
            ['title'],
            'Cuccia',
            ['it'],
            'it'
        );
        const otherDraft = await translationRepository.resolveEntityFields(
            'product',
            [id],
            ['it'],
            'de'
        );

        expect(previewed.get(id)).toEqual({ title: 'Cuccia' });
        expect(found).toEqual([id]);
        expect(otherDraft.size).toBe(0);
    });

    it('serves nothing for a draft tag that has no language row', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it', { active: false });
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        /**
         * Straight at the model: the cascade would take the translation rows with it, and a delete
         * racing a write is exactly the case where the row outlives its language.
         */
        await localeModel.deleteOne({ tag: 'it' }).exec();

        const resolved = await translationRepository.resolveEntityFields(
            'product',
            [id],
            ['it'],
            'it'
        );

        expect(resolved.size).toBe(0);
    });

    it('serves that text again once the language goes live', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it', { active: false });
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        const draft = await localeRepository.findByTag('it');
        if (!draft) throw new Error('the draft language was just created');
        draft.active = true;
        await localeRepository.save(draft);

        const resolved = await translationRepository.resolveEntityFields('product', [id], ['it']);

        expect(resolved.get(id)).toEqual({ title: 'Cuccia' });
    });

    it('serves no row whose language is gone, a draft nor an orphan', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await givenLocale('fr', { active: false });
        // `xx` has no `locales` row at all: what a write racing a language delete leaves behind.
        await translationRepository.upsertEntityLocale(
            'product',
            id,
            'xx',
            { title: 'Orfano' },
            'human',
            undefined,
            undefined
        );
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } },
            fr: { fields: { title: 'Brouillon' } }
        });
        const chain = ['xx', 'fr', 'it'];

        const resolved = await translationRepository.resolveEntityFields('product', [id], chain);
        const found = await translationRepository.findEntityIdsByFieldMatch(
            'product',
            ['title'],
            'Orfano',
            chain
        );

        expect(resolved.get(id)).toEqual({ title: 'Cuccia' });
        expect(found).toEqual([]);
    });

    it('ignores a leftover row in the default language, in a read and in a search', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await leftoverDefaultRow(id, { title: 'Shadow' });
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        // The default's own tag is in the chain, as `localeCandidatesFor` always puts it last.
        const chain = ['it', FALLBACK];

        const resolved = await translationRepository.resolveEntityFields('product', [id], chain);
        const shadowed = await translationRepository.findEntityIdsByFieldMatch(
            'product',
            ['title'],
            'Shadow',
            chain
        );

        expect(resolved.get(id)).toEqual({ title: 'Cuccia' });
        expect(shadowed).toEqual([]);
    });

    it('answers nothing for a request in the default language, whatever rows are left over', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await leftoverDefaultRow(id, { title: 'Shadow' });

        const resolved = await translationRepository.resolveEntityFields(
            'product',
            [id],
            [FALLBACK]
        );

        expect(resolved.size).toBe(0);
    });

    it('reads only the served rows for a message that outlives the entity', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await givenLocale('fr', { active: false });
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } },
            fr: { fields: { title: 'Brouillon' } }
        });

        const all = await translationRepository.findEntityTranslations('product', id);
        const served = await translationRepository.findServedEntityTranslations('product', id);

        expect(all.map((row) => row.locale)).toEqual(['fr', 'it']);
        expect(served.map((row) => row.locale)).toEqual(['it']);
    });

    it.each([
        ['an upsert', { fields: { title: 'Kennel' } }],
        ['a delete (null)', null]
    ])(
        'refuses the default language as %s, naming it, and writes nothing',
        async (_label, slot) => {
            const product = await createProduct();
            const id = String(product._id);
            await givenLocale('it');

            const result = await localeService.updateEntityTranslations('product', id, {
                it: { fields: { title: 'Cuccia' } },
                [FALLBACK]: slot
            });

            expect(result.status).toBe(422);
            expect(result.errors?.[0]?.details).toEqual({ field: FALLBACK });
            expect(await translationRepository.findEntityTranslations('product', id)).toEqual([]);
        }
    );

    it('refuses a field the registry does not declare for this entityType', async () => {
        const product = await createProduct();

        const result = await localeService.updateEntityTranslations(
            'product',
            String(product._id),
            {
                it: { fields: { title: 'Cuccia', price: '24.90' } }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses an empty fields object rather than treating it as a delete', async () => {
        const product = await createProduct();

        const result = await localeService.updateEntityTranslations(
            'product',
            String(product._id),
            {
                it: { fields: {} }
            }
        );

        expect(result.status).toBe(422);
    });

    it('refuses the default language spelled in another casing, and keeps a leftover row', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await leftoverDefaultRow(id, { title: 'Stale' });

        const result = await localeService.updateEntityTranslations('product', id, { EN: null });

        expect(result.status).toBe(422);
        expect(
            await translationRepository.findEntityLocale('product', id, FALLBACK)
        ).not.toBeNull();
    });

    it('writes a locale named in another casing under its canonical tag', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('pt-BR');

        const result = await localeService.updateEntityTranslations('product', id, {
            'PT-br': { fields: { title: 'Caminha' } }
        });

        expect(result.success).toBe(true);
        expect(result.data?.translations.map((row) => row.locale)).toContain('pt-BR');
    });

    it('deletes a locale row on null', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const result = await localeService.updateEntityTranslations('product', id, { it: null });

        expect(result.success).toBe(true);
        expect(result.data?.translations.map((row) => row.locale)).toEqual([]);
    });

    it('leaves an existing locale untouched when the body does not name it', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');
        await givenLocale('de');
        await localeService.updateEntityTranslations('product', id, {
            de: { fields: { title: 'Hundekorb' } },
            it: { fields: { title: 'Cuccia' } }
        });

        await localeService.updateEntityTranslations('product', id, {
            de: { fields: { title: 'Hundekorb, neu' } }
        });

        const result = await localeService.getEntityTranslations('product', id);
        const it = result.data?.translations.find((row) => row.locale === 'it');
        expect(it?.fields.title).toBe('Cuccia');
    });

    it('validates the whole batch before writing anything', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');

        const result = await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } },
            xx: { fields: { title: 'Cozy Bed' } } // unregistered locale — the whole batch must fail
        });

        expect(result.status).toBe(422);
        const rows = await translationRepository.findEntityTranslations('product', id);
        expect(rows).toEqual([]);
    });

    it('never writes the entity’s own text', async () => {
        const product = await createProduct({ title: 'Untouched' });
        const id = String(product._id);
        await givenLocale('it');

        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Titolo' } }
        });

        const stored = await readProduct(id);
        expect(stored?.title).toBe('Untouched');
    });

    it('stamps every row of a batch with the digest of the entity’s text as it stands', async () => {
        const product = await createProduct({ title: 'Cozy Bed', description: 'Extra support' });
        const id = String(product._id);
        await givenLocale('it');
        await givenLocale('de');

        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } },
            de: { fields: { title: 'Hundekorb' } }
        });

        const rows = await translationRepository.findEntityTranslations('product', id);
        const expected = deriveSourceDigest({ title: 'Cozy Bed', description: 'Extra support' });
        expect(rows.map((row) => row.sourceDigest)).toEqual([expected, expected]);
    });

    it('does not re-stamp a sibling row when the entity’s text changes later', async () => {
        const product = await createProduct({ title: 'Cozy Bed' });
        const id = String(product._id);
        await givenLocale('it');
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        const [before] = await translationRepository.findEntityTranslations('product', id);

        const stored = await readProduct(id);
        if (!stored) throw new Error('the product was just created');
        stored.title = 'Bed, revised';
        await saveProduct(stored);

        const [after] = await translationRepository.findEntityTranslations('product', id);
        expect(after.sourceDigest).toBe(before.sourceDigest);
        expect(after.sourceDigest).not.toBe(deriveSourceDigest({ title: 'Bed, revised' }));
    });

    it('keeps the digest of a row re-sent unchanged, and stamps one whose text changes', async () => {
        const product = await createProduct({ title: 'Cozy Bed' });
        const id = String(product._id);
        await givenLocale('it');
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        const stored = await readProduct(id);
        if (!stored) throw new Error('the product was just created');
        stored.title = 'Bed, revised';
        await saveProduct(stored);

        // The same Italian text, sent again beside the edit of the source: not a review of it.
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });
        const resent = await localeService.getEntityTranslations('product', id);
        expect(resent.data?.translations.map((row) => row.outdated)).toEqual([true]);

        // Changing the row's own text is.
        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia nuova' } }
        });
        const changed = await localeService.getEntityTranslations('product', id);
        expect(changed.data?.translations.map((row) => row.outdated)).toEqual([false]);
    });

    it('defaults origin to human', async () => {
        const product = await createProduct();
        const id = String(product._id);
        await givenLocale('it');

        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia' } }
        });

        const [row] = await translationRepository.findEntityTranslations('product', id);
        expect(row.origin).toBe('human');
    });
});

/** A product with an Italian row carrying both fields. */
const seededProduct = async () => {
    const product = await createProduct({ title: 'Cozy Bed', description: 'Extra support' });
    const id = String(product._id);
    await givenLocale('it');
    await localeService.updateEntityTranslations('product', id, {
        it: { fields: { title: 'Cuccia', description: 'Supporto extra' } }
    });
    return id;
};

describe('updateEntityTranslations, field by field (RFC 7396)', () => {
    it('changes only the field named, and keeps the others in the row', async () => {
        const id = await seededProduct();

        await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia XL' } }
        });

        const row = await translationRepository.findEntityLocale('product', id, 'it');
        expect(row?.fields).toEqual({ title: 'Cuccia XL', description: 'Supporto extra' });
    });

    it('clears one field on null', async () => {
        const id = await seededProduct();

        const result = await localeService.updateEntityTranslations('product', id, {
            it: { fields: { description: null } }
        });

        expect(result.success).toBe(true);
        const row = await translationRepository.findEntityLocale('product', id, 'it');
        expect(row?.fields).toEqual({ title: 'Cuccia' });
    });

    it('refuses a value the product itself would refuse, naming the locale and field', async () => {
        const id = await seededProduct();

        const result = await localeService.updateEntityTranslations('product', id, {
            it: { fields: { title: 'abc' } }
        });

        expect(result.status).toBe(422);
        expect(result.errors?.[0]?.details).toEqual({ field: 'it.title' });
        const row = await translationRepository.findEntityLocale('product', id, 'it');
        expect(row?.fields).toMatchObject({ title: 'Cuccia' });
    });

    it.each([
        ['an empty description', { description: '' }],
        ['a cleared title', { title: null }]
    ])('refuses %s — a description is cleared with null, a title never', async (_label, fields) => {
        const id = await seededProduct();

        const result = await localeService.updateEntityTranslations('product', id, {
            it: { fields }
        });

        expect(result.status).toBe(422);
        const row = await translationRepository.findEntityLocale('product', id, 'it');
        expect(row?.fields).toEqual({ title: 'Cuccia', description: 'Supporto extra' });
    });
});

describe('replaceEntityTranslations', () => {
    it('refuses a nonexistent entity with 404, writing no rows', async () => {
        const missingId = new Types.ObjectId().toString();
        await givenLocale('it');

        const result = await localeService.replaceEntityTranslations('product', missingId, {
            it: { fields: { title: 'Cuccia' } }
        });

        expect(result.status).toBe(404);
        const rows = await translationRepository.findEntityTranslations('product', missingId);
        expect(rows).toEqual([]);
    });

    it('clears a declared field a sent locale leaves out — a PUT states the locale whole', async () => {
        const id = await seededProduct();

        const result = await localeService.replaceEntityTranslations('product', id, {
            it: { fields: { title: 'Cuccia XL' } }
        });

        expect(result.success).toBe(true);
        const row = await translationRepository.findEntityLocale('product', id, 'it');
        expect(row?.fields).toEqual({ title: 'Cuccia XL' });
    });

    it('deletes a stored locale the body leaves out, and an empty body deletes them all', async () => {
        const id = await seededProduct();
        await givenLocale('de');
        await localeService.updateEntityTranslations('product', id, {
            de: { fields: { title: 'Hundekorb' } }
        });

        const kept = await localeService.replaceEntityTranslations('product', id, {
            de: { fields: { title: 'Hundekorb' } }
        });
        expect(kept.data?.translations.map((row) => row.locale)).toEqual(['de']);

        const none = await localeService.replaceEntityTranslations('product', id, {});
        expect(none.data?.translations).toEqual([]);
    });

    it('neither requires nor deletes the default language, and a leftover row in it stays put', async () => {
        const product = await createProduct({ title: 'Cozy Bed' });
        const id = String(product._id);
        await givenLocale('it');
        await leftoverDefaultRow(id, { title: 'Stale' });

        const result = await localeService.replaceEntityTranslations('product', id, {
            IT: { fields: { title: 'Cuccia' } }
        });

        expect(result.success).toBe(true);
        expect(result.data?.translations.map((row) => row.locale)).toEqual(['it']);
        expect(
            await translationRepository.findEntityLocale('product', id, FALLBACK)
        ).not.toBeNull();
    });

    it('refuses the default language in the body', async () => {
        const product = await createProduct();

        const result = await localeService.replaceEntityTranslations(
            'product',
            String(product._id),
            { [FALLBACK]: { fields: { title: 'Cozy Bed' } } }
        );

        expect(result.status).toBe(422);
        expect(result.errors?.[0]?.details).toEqual({ field: FALLBACK });
    });

    it('still refuses an empty fields object instead of clearing everything', async () => {
        const product = await createProduct();
        await givenLocale('it');

        const result = await localeService.replaceEntityTranslations(
            'product',
            String(product._id),
            { it: { fields: {} } }
        );

        expect(result.status).toBe(422);
    });
});
