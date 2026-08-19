/**
 * The dynamic locale tier's slice of the demo dataset.
 *
 * Chosen to cover the branches this module actually has, on the principle every other seeder here
 * follows — a branch with no fixture is a branch nothing exercises. The four languages are picked
 * so that between them they occupy every square of the grid this module's design draws: deployed
 * file or not, rows or not, active or not.
 *
 *   es, active, ten app rows  THE POINT OF THE FEATURE, and DELIBERATELY NOT A DEPLOYED FILE.
 *                             Spanish exists in this repository only as rows, which is what makes
 *                             it the honest fixture for a language a client downloads rather than
 *                             bundles: nothing about it can be answered from the filesystem, so a
 *                             regression that quietly started serving files would show up here.
 *   es, two api rows          STORED AND INERT, on purpose. They name the API's own keyspace for a
 *                             language the API has no dictionary file for, so
 *                             `applyLocaleOverrides` skips them and logs — the exact warning branch
 *                             that fires when someone translates the backend half of a language
 *                             nobody has deployed yet. It is also the sharpest available proof
 *                             that the two scopes are separate keyspaces rather than one
 *                             collection with a label: `generic.*` exists on both sides, and only
 *                             the `app` half reaches a frontend.
 *   it, active, two api rows  The MERGE, and the overlay that actually applies. Italian is a
 *                             deployed file, so this row merges with the static tier into one
 *                             manifest entry carrying both scopes and `source: 'both'`, and its
 *                             two `api` rows override keys `src/locales/it.json` really defines —
 *                             so `t('generic.error-unauthorized')` under `Accept-Language: it`
 *                             answers the row, not the file. No `app` rows, and that is a fact
 *                             rather than an omission: a client that already bundles Italian has
 *                             nothing to download, which is why `entryCount` is 0 for a language
 *                             the manifest nonetheless reports as fully supported.
 *   keys three levels deep    The tree builder gets a real specimen rather than a flat list, and
 *                             the frontend's mocks get a dictionary shaped like a dictionary.
 *   fr, inactive, two rows    The visibility branch. An inactive language must be absent from the
 *                             manifest and 404 on its dictionary, and neither is checkable against
 *                             a dataset where every language is active.
 *   ja, inactive, no rows     The EMPTY language — registered, nothing translated yet. It is the
 *                             state every language passes through between `POST /locales` and the
 *                             first entry, and it is inactive because that is the only responsible
 *                             thing to be: publishing it would offer a dictionary with no words
 *                             in it. Its `revision` is left unstated so the exported dataset
 *                             records the schema's `0` rather than a fixture's guess.
 *   en                        NOT SEEDED, deliberately. The merge needs a static-ONLY row to merge
 *                             nothing into, and `en` is it.
 *
 * `revision` is stated rather than left at the schema's 0 for every language that has entries.
 * These rows are written straight to Mongo, so they bypass the repository call that bumps — one
 * import's worth of writes produced these dictionaries, and `1` is what that would have left
 * behind.
 */
import { LocaleScope } from '@types';
import { makeLocale, makeLocaleEntry } from './factory';
import { localeModel, localeMessageModel } from './model';
import { localeRepository, localeMessageRepository } from './repository';
import { upsertById, type SeedOutcome } from '@infrastructure/persistence/seed';

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
     * Registered, empty, and inactive because of it — the state a language is in between the
     * `POST` that creates it and the first key anyone translates. No entries at all, so it is also
     * the fixture for every count that has to survive a language with nothing in it: `entryCount`
     * of 0, a `revision` still at the schema's default, and a cascade delete that removes no rows.
     */
    makeLocale({
        id: '65e01f3c9a7d4b2e1c0f0004',
        tag: SEED_LOCALE_TAGS.empty,
        name: 'Japanese',
        nativeName: '日本語',
        active: false
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

    /*
     * The API's own half, for the same language — STORED, VALID, AND NOT APPLIED.
     *
     * Spanish has no deployed dictionary in this repository, and `applyLocaleOverrides` refuses to
     * register a bundle for a language `listSupportedLocales()` does not name: negotiating a
     * language i18next cannot resolve would answer `Content-Language: es` over English copy, and a
     * header that lies is worse than the language being unavailable. So these two rows are skipped
     * and logged, which is the branch they are here to give a fixture — the state a deployment is
     * in when someone has translated the backend half of a language nobody has shipped files for.
     * Deploy `src/locales/es.json` and the same two rows start answering, with nothing else
     * changed.
     *
     * They also stay the sharpest available proof that the two scopes are separate keyspaces:
     * `generic.*` is declared by the frontend as well, and if scope were a label rather than part
     * of the row's identity these would collide with the `app` rows above. Neither appears in
     * `GET /locales/es/messages`, which serves `app` rows only.
     */
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3001',
        locale: SEED_LOCALE_TAGS.downloadable,
        scope: LocaleScope.api,
        key: 'generic.error-unauthorized',
        value: 'Sesión caducada. Vuelve a entrar.'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3002',
        locale: SEED_LOCALE_TAGS.downloadable,
        scope: LocaleScope.api,
        key: 'generic.error-internal',
        value: 'Algo ha fallado por nuestra parte. Inténtalo de nuevo.'
    }),

    /*
     * The overlay that DOES apply, and the counterpart to the two rows above.
     *
     * Both keys exist in the deployed `src/locales/it.json`, so these override real strings rather
     * than introducing new ones — which is the mechanism stated in the smallest form that can be
     * checked: a 401 under `Accept-Language: it` answers this text, and the file's text is what it
     * answers with these rows deleted. Same two keys as the Spanish pair on purpose; the only
     * difference between the two sets is whether a file is deployed, so a reader comparing them
     * sees exactly what that one fact decides.
     */
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3101',
        locale: SEED_LOCALE_TAGS.answerable,
        scope: LocaleScope.api,
        key: 'generic.error-unauthorized',
        value: 'Sessione scaduta. Accedi di nuovo.'
    }),
    makeLocaleEntry({
        id: '65e0200a9a7d4b2e1c0f3102',
        locale: SEED_LOCALE_TAGS.answerable,
        scope: LocaleScope.api,
        key: 'generic.error-internal',
        value: 'Qualcosa è andato storto dalla nostra parte. Riprova.'
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
        .sort({ locale: 1, scope: 1, key: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
