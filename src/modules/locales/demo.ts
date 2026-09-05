/**
 * @module
 * The dynamic locale tier's slice of the demo dataset — four languages chosen to exercise
 * every state a language and its entries can be in (see the fixtures below for which).
 * `revision` is stated explicitly since these rows bypass the repository call that
 * normally bumps it.
 */

import { backendTenant, frontendTenant } from './tenants';
import { makeLocale, makeLocaleEntry } from './fixtures';
import { localeModel, localeEntryModel } from './model';
import { localeRepository, localeEntryRepository } from './repository';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';

/** The seeded languages, named by what each one is here to demonstrate. */
export const SEED_LOCALE_TAGS = {
    /** A language that exists ONLY as rows — no deployed file — downloadable from the API. */
    downloadable: 'es',
    /** A language deployed as files AND registered here, so its API copy can be overridden. */
    answerable: 'it',
    /** A language being translated, not yet published. */
    draft: 'fr',
    /** A language registered and not yet translated at all. */
    empty: 'ja'
} as const;

/** The seeded languages themselves — see `SEED_LOCALE_TAGS` for what each one demonstrates. */
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
    }),
    /*
     * The only seeded language the API also has a deployed file for, which is the whole reason it
     * is here: it is the one row `mergeCapabilities` has anything to merge WITH.
     */
    makeLocale({
        id: '65e01f3c9a7d4b2e1c0f0003',
        tag: SEED_LOCALE_TAGS.answerable,
        name: 'Italian',
        nativeName: 'Italiano',
        revision: 1
    }),
    /*
     * Registered, empty and inactive — the state between the `POST` that creates a
     * language and its first translated key. Covers the zero-entries case: `entryCount`
     * of 0, `revision` at its default, a cascade delete that removes no rows.
     */
    makeLocale({
        id: '65e01f3c9a7d4b2e1c0f0004',
        tag: SEED_LOCALE_TAGS.empty,
        name: 'Japanese',
        nativeName: '日本語',
        active: false
    })
];

/**
 * Ten Spanish strings across four namespaces and up to three levels, so the tree the builder
 * produces has actual shape. `products.list.filters.*` is the deep one: a flat fixture set would
 * let a builder that only ever nests once pass.
 */
export const localeEntryFixtures = [
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1001',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'products.list.title',
        value: 'Catálogo'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1002',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'products.list.empty',
        value: 'Sin resultados'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1003',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'products.list.filters.title',
        value: 'Filtros'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1004',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'products.list.filters.reset',
        value: 'Quitar filtros'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1005',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'products.detail.add-to-cart',
        value: 'Añadir al carrito'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1006',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'cart.title',
        value: 'Tu carrito'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1007',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'cart.empty',
        value: 'Tu carrito está vacío'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1008',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'checkout.title',
        value: 'Finalizar compra'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f1009',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'checkout.actions.confirm',
        value: 'Confirmar pedido'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f100a',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: frontendTenant(),
        key: 'account.menu.orders',
        value: 'Mis pedidos'
    }),

    /*
     * The API's own half, for the same language — STORED, VALID, AND NOT APPLIED.
     * Spanish has no deployed dictionary, so `applyLocaleOverrides` skips and logs these:
     * the fixture for a backend translated ahead of its file. Also proves tenants are
     * separate keyspaces — `generic.*` exists for the frontend tenant too, without colliding.
     */
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3001',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: backendTenant(),
        key: 'generic.error-unauthorized',
        value: 'Sesión caducada. Vuelve a entrar.'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3002',
        locale: SEED_LOCALE_TAGS.downloadable,
        tenant: backendTenant(),
        key: 'generic.error-internal',
        value: 'Algo ha fallado por nuestra parte. Inténtalo de nuevo.'
    }),

    /*
     * The overlay that DOES apply — counterpart to the two Spanish rows above, same keys,
     * but Italian has a deployed `src/locales/it.json`, so these override real strings
     * rather than introducing new ones.
     */
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3101',
        locale: SEED_LOCALE_TAGS.answerable,
        tenant: backendTenant(),
        key: 'generic.error-unauthorized',
        value: 'Sessione scaduta. Accedi di nuovo.'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3102',
        locale: SEED_LOCALE_TAGS.answerable,
        tenant: backendTenant(),
        key: 'generic.error-internal',
        value: 'Qualcosa è andato storto dalla nostra parte. Riprova.'
    }),

    /* The draft language: two rows, enough to prove `active: false` hides something real. */
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f2001',
        locale: SEED_LOCALE_TAGS.draft,
        tenant: frontendTenant(),
        key: 'products.list.title',
        value: 'Catalogue'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f2002',
        locale: SEED_LOCALE_TAGS.draft,
        tenant: frontendTenant(),
        key: 'cart.title',
        value: 'Votre panier'
    })
];

/**
 * Seed both collections. Declared in `module.ts`; called by `db/demo/index.ts`.
 * Languages first: an entry names its language by tag, and landing entries before
 * their language would publish a dictionary the manifest doesn't list.
 */
export const seedLocalesCollection = async (): Promise<SeedOutcome[]> => {
    const languages = await Promise.all(
        localeFixtures.map((language) => upsertById(localeRepository, language))
    );
    const entries = await Promise.all(
        localeEntryFixtures.map((entry) => upsertById(localeEntryRepository, entry))
    );

    return [...languages, ...entries];
};

/**
 * Read both collections back as stored — `module.ts` declares this, `export-demo-dataset.ts`
 * calls it. These are stored rows, not endpoint responses: the frontend's mocks do the
 * same tier-merge assembly the API does, rather than replaying a published answer.
 * Sorted so the exported file is byte-stable regardless of Mongo's natural order.
 */
export const exportSeededLocales = async (): Promise<Record<string, unknown[]>> => ({
    locales: await exportCollection(localeModel, { tag: 1 }),
    localeEntries: await exportCollection(localeEntryModel, { locale: 1, tenant: 1, key: 1 })
});
