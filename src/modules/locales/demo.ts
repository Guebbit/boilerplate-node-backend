/**
 * The dynamic locale tier's slice of the demo dataset.
 *
 * Chosen to cover the branches this module actually has, on the principle every other seeder here
 * follows — a branch with no fixture is a branch nothing exercises:
 *
 *   es, active, ten entries   THE POINT OF THE FEATURE. `es` is also a deployed file, so it is the
 *                             fixture that makes the manifest's merge real: one row, both scopes,
 *                             `source: 'both'`.
 *   keys three levels deep    The tree builder gets a real specimen rather than a flat list, and
 *                             the frontend's mocks get a dictionary shaped like a dictionary.
 *   fr, inactive, two rows    The visibility branch. An inactive language must be absent from the
 *                             manifest and 404 on its dictionary, and neither is checkable against
 *                             a dataset where every language is active.
 *   en                        NOT SEEDED, deliberately. The merge needs a static-ONLY row to merge
 *                             nothing into, and `en` is it.
 *
 * `revision` is stated rather than left at the schema's 0. These rows are written straight to
 * Mongo, so they bypass the repository call that bumps — one import's worth of writes produced
 * this dictionary, and `1` is what that would have left behind.
 */

import { makeLocale, makeLocaleEntry } from './factory';
import { localeModel, localeMessageModel } from './model';
import { localeRepository, localeMessageRepository } from './repository';
import { upsertById, type SeedOutcome } from '@infrastructure/persistence/seed';

/** The seeded languages, named by what each one is here to demonstrate. */
export const SEED_LOCALE_TAGS = {
    /** A language the frontend does not bundle, downloadable from the API. */
    downloadable: 'es',
    /** A language being translated, not yet published. */
    draft: 'fr'
} as const;

export const localeFixtures = [
    makeLocale({
        id: '65e01f3c9a7d4b2e1c0f0001',
        tag: SEED_LOCALE_TAGS.downloadable,
        name: 'Spanish',
        nativeName: 'Español',
        revision: 1
    }),
    /*
     * Inactive, and that is the whole fixture. It has entries so that "inactive hides a dictionary
     * that exists" is what gets tested, rather than "an empty language has nothing to show".
     */
    makeLocale({
        id: '65e01f3c9a7d4b2e1c0f0002',
        tag: SEED_LOCALE_TAGS.draft,
        name: 'French',
        nativeName: 'Français',
        active: false,
        revision: 1
    })
];

/*
 * Ten Spanish strings across four namespaces and up to three levels, so the tree the builder
 * produces has actual shape. `products.list.filters.*` is the deep one: a flat fixture set would
 * let a builder that only ever nests once pass.
 */
export const localeEntryFixtures = [
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1001',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'products.list.title',
        value: 'Catálogo'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1002',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'products.list.empty',
        value: 'Sin resultados'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1003',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'products.list.filters.title',
        value: 'Filtros'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1004',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'products.list.filters.reset',
        value: 'Quitar filtros'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1005',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'products.detail.add-to-cart',
        value: 'Añadir al carrito'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1006',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'cart.title',
        value: 'Tu carrito'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1007',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'cart.empty',
        value: 'Tu carrito está vacío'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1008',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'checkout.title',
        value: 'Finalizar compra'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1009',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'checkout.actions.confirm',
        value: 'Confirmar pedido'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f100a',
        locale: SEED_LOCALE_TAGS.downloadable,
        key: 'account.menu.orders',
        value: 'Mis pedidos'
    }),

    /* The draft language: two rows, enough to prove `active: false` hides something real. */
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f2001',
        locale: SEED_LOCALE_TAGS.draft,
        key: 'products.list.title',
        value: 'Catalogue'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f2002',
        locale: SEED_LOCALE_TAGS.draft,
        key: 'cart.title',
        value: 'Votre panier'
    })
];

/**
 * Seed both collections. Declared in `module.ts`; called by `db/demo/index.ts`.
 *
 * Languages first, and sequentially against the entries: an entry names a language by tag, and a
 * dataset whose entries could land before their language would publish a dictionary for a language
 * the manifest does not list.
 */
export const seedLocalesCollection = async (): Promise<SeedOutcome[]> => {
    const languages = await Promise.all(
        localeFixtures.map((language) => upsertById(localeRepository, language))
    );
    const entries = await Promise.all(
        localeEntryFixtures.map((entry) => upsertById(localeMessageRepository, entry))
    );

    return [...languages, ...entries];
};

/**
 * Read both collections back as stored — `module.ts` declares this, `scripts/export-seed.ts` calls
 * it.
 *
 * These are STORED ROWS, and neither collection is what any endpoint returns: the manifest is a
 * merge of two tiers and the dictionary is built from these rows. The frontend's mocks answer the
 * endpoints from them, which means the mock does the same assembly the API does — the alternative,
 * publishing the assembled responses, would publish this repo's answer and let the mock stop
 * exercising the assembly at all.
 *
 * Sorted so the published file is byte-stable rather than dependent on Mongo's natural order.
 */
export const exportSeededLocales = async (): Promise<Record<string, unknown[]>> => ({
    locales: await localeModel
        .find()
        .sort({ tag: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON())),
    localeMessages: await localeMessageModel
        .find()
        .sort({ locale: 1, key: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
