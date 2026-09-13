/**
 * @module
 * The dynamic locale tier's slice of the demo dataset — five languages chosen to exercise
 * every state a language and its entries can be in (see the fixtures below for which).
 * `revision` is stated explicitly since these rows bypass the repository call that
 * normally bumps it.
 */

import { backendTenant, frontendTenant } from '@modules/locales/tenants';
import { makeLocale, makeLocaleEntry } from '@modules/locales/factories';
import { localeRepository, localeEntryRepository } from '@modules/locales/repository';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';
import { getFallbackLocale } from '@infrastructure/i18n';

/** The seeded languages, named by what each one is here to demonstrate. */
const SEED_LOCALE_TAGS = {
    /** The deployment's fallback locale — the product catalogue's source language. Every
     * product's fallback-locale `translations` row needs this to exist and be active, or
     * `planTranslations` has nothing to validate that row's own locale against (`./products`). */
    source: getFallbackLocale(),
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
    /* No `revision` and no entries: this one's dictionary is the deployed `en.json` file rather
     * than a set of dynamic rows, so it sits at the model's default revision. */
    makeLocale({
        id: '65e01f3c9a7d4b2e1c0f0005',
        tag: SEED_LOCALE_TAGS.source,
        name: 'English',
        nativeName: 'English'
    }),
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

/** One entry, as `[id, locale, tenant, key, value]` — see the groups in {@link LOCALE_ENTRIES}. */
type LocaleEntryRow = [
    id: string,
    locale: keyof typeof SEED_LOCALE_TAGS,
    tenant: 'frontend' | 'backend',
    key: string,
    value: string
];

/**
 * Sixteen translated strings, grouped by what each group demonstrates. The first ten are Spanish,
 * against keys the paired frontend's own `en.json` files actually declare — so a real dictionary
 * deployed for `es` tomorrow would slot these straight in, and an admin editing them today sees a
 * key that means something. `static-pages.about.features.catalogue.title` is the deep one, five
 * levels, so a builder that only ever nests once would fail here. Ids are the fixture's own, not
 * derived: each group has its own hex band and they don't run on from one another.
 */
const LOCALE_ENTRIES: LocaleEntryRow[] = [
    [
        '65e0200a9a7d4b2e1c0f1001',
        'downloadable',
        'frontend',
        'products-list-page.page-title',
        'Catálogo de productos'
    ],
    [
        '65e0200a9a7d4b2e1c0f1002',
        'downloadable',
        'frontend',
        'product-target-page.out-of-stock',
        'Agotado'
    ],
    [
        '65e0200a9a7d4b2e1c0f1003',
        'downloadable',
        'frontend',
        'static-pages.about.features.catalogue.title',
        'Explora el catálogo'
    ],
    ['65e0200a9a7d4b2e1c0f1004', 'downloadable', 'frontend', 'generic.reset', 'Restablecer'],
    [
        '65e0200a9a7d4b2e1c0f1005',
        'downloadable',
        'frontend',
        'product-target-page.button-add-to-cart',
        'Añadir al carrito'
    ],
    ['65e0200a9a7d4b2e1c0f1006', 'downloadable', 'frontend', 'cart-page.page-title', 'Mi carrito'],
    [
        '65e0200a9a7d4b2e1c0f1007',
        'downloadable',
        'frontend',
        'cart-page.empty-cart',
        'Tu carrito está vacío'
    ],
    [
        '65e0200a9a7d4b2e1c0f1008',
        'downloadable',
        'frontend',
        'cart-page.button-checkout',
        'Finalizar compra'
    ],
    [
        '65e0200a9a7d4b2e1c0f1009',
        'downloadable',
        'frontend',
        'cart-page.success-checkout',
        '¡Pedido realizado con éxito!'
    ],
    [
        '65e0200a9a7d4b2e1c0f100a',
        'downloadable',
        'frontend',
        'orders-list-page.page-title',
        'Mis pedidos'
    ],

    /*
     * The API's own half, for the same language — STORED, VALID, AND NOT APPLIED. Spanish has no
     * deployed dictionary, so `applyLocaleOverrides` skips and logs these: the fixture for a
     * backend translated ahead of its file. Also proves tenants are separate keyspaces: the same
     * keys exist for the frontend tenant above without colliding.
     */
    [
        '65e0200a9a7d4b2e1c0f3001',
        'downloadable',
        'backend',
        'generic.error-unauthorized',
        'Sesión caducada. Vuelve a entrar.'
    ],
    [
        '65e0200a9a7d4b2e1c0f3002',
        'downloadable',
        'backend',
        'generic.error-internal',
        'Algo ha fallado por nuestra parte. Inténtalo de nuevo.'
    ],

    /*
     * The overlay that DOES apply — same keys as the pair above, but Italian has a deployed
     * `src/locales/it.json`, so these override real strings rather than introducing new ones.
     */
    [
        '65e0200a9a7d4b2e1c0f3101',
        'answerable',
        'backend',
        'generic.error-unauthorized',
        'Sessione scaduta. Accedi di nuovo.'
    ],
    [
        '65e0200a9a7d4b2e1c0f3102',
        'answerable',
        'backend',
        'generic.error-internal',
        'Qualcosa è andato storto dalla nostra parte. Riprova.'
    ],

    /* The draft language: two rows, enough to prove `active: false` hides something real. */
    ['65e0200a9a7d4b2e1c0f2001', 'draft', 'frontend', 'products-list-page.page-title', 'Catalogue'],
    ['65e0200a9a7d4b2e1c0f2002', 'draft', 'frontend', 'cart-page.page-title', 'Votre panier']
];

/** {@link LOCALE_ENTRIES}, built into fixtures. */
export const localeEntryFixtures = LOCALE_ENTRIES.map(([id, locale, tenant, key, value]) =>
    makeLocaleEntry({
        id,
        locale: SEED_LOCALE_TAGS[locale],
        tenant: tenant === 'backend' ? backendTenant() : frontendTenant(),
        key,
        value
    })
);

/**
 * Seed both collections. Declared in `./index`'s `shopModules`; walked by `seedShop`.
 * Languages first: an entry names its language by tag, and landing entries before
 * their language would publish a dictionary the manifest doesn't list.
 */
export const seedLocalesCollection = async (): Promise<SeedOutcome[]> => {
    const languages = await Promise.all(
        localeFixtures.map((language) => insertIfAbsent(localeRepository, language))
    );
    const entries = await Promise.all(
        localeEntryFixtures.map((entry) => insertIfAbsent(localeEntryRepository, entry))
    );

    return [...languages, ...entries];
};
