/**
 * @module
 * The catalogue's slice of the demo dataset. `scenarios/apply.ts` seeds these rows into a live
 * database; `tests/integration/scenarios/shop.test.ts` seeds them into a throwaway one and checks
 * what the API answers for each against the generated response schema. A field a record omits
 * falls to `@modules/products/model`'s `default:` — see `@modules/products/factories`.
 *
 * Six named rows carry the branch coverage the storefront and repositories actually exercise
 * (soft-deleted, out of stock, inactive, minimal); `./products-filler` supplies a further 126 rows
 * combinatorially, so the catalogue reads like a real pet-supply retailer rather than a list of
 * edge cases. Every image comes from `./products-images.generated.json` (`npm run scenario:images`) —
 * none is hand-placed. The filler rows share a fixed pool of 20 images by cycling through it
 * (`FILLER_IMAGE_ROLE_KEYS`), so a larger grid never means a new download.
 *
 * Every row's `title`/`description` are written twice: once here, flat, as the product document's
 * own derived index column (what `text`/`title=` search and the stock board's sort read), and once
 * as a `translations` row per locale — see {@link seedProductsCollection}.
 */

import { FILLER_IMAGE_ROLE_KEYS, FILLER_PRODUCTS, fillerProductId } from './products-filler';

/**
 * Re-exported so `./cart`, `./orders` and `./wishlist` can address a specific filler row (for
 * variety beyond the six named products) through this file rather than reaching into
 * `./products-filler` directly.
 */
export { fillerProductId } from './products-filler';
import productImages from './products-images.generated.json';
import { SEED_PRODUCT_IDS } from './subjects';
import { makeProduct } from '@modules/products/factories';
import { productModel } from '@modules/products/model';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';
import { productRepository } from '@modules/products/repository';
import {
    getFallbackLocale,
    isTranslationPlan,
    planTranslations,
    writeTranslations
} from '@infrastructure/i18n';
import type { ProductTranslationFields, UpsertTranslationsRequest } from '@types';

/**
 * One product's copy, per locale.
 *
 * `en` is required and `it` is not: `en` is the fallback, the one locale `planTranslations` will
 * not let a row be deleted in, and the one the product document's own derived index column is
 * written from. Every other locale is a fixture author's choice — a product shipped in English
 * alone is a legitimate state of a real catalogue, and the seeder writes exactly what it finds.
 */
interface ProductCopy {
    en: ProductTranslationFields;
    it?: ProductTranslationFields;
}

/**
 * Each named product's copy, both locales — the single source `namedProducts`' `title`/
 * `description` and the translation batch below both read from, so the English string is written
 * once and never duplicated by hand. `barebones` has no `description` in either locale, matching
 * its deliberately minimal English fixture.
 */
const NAMED_PRODUCT_COPY: Record<keyof typeof SEED_PRODUCT_IDS, ProductCopy> = {
    dogFoodStandard: {
        en: {
            title: 'Premium Grain-Free Dog Food, 15kg',
            description:
                'A complete, balanced diet formulated for adult dogs, made with real chicken and rice.'
        },
        it: {
            title: 'Crocchette Premium Senza Cereali per Cani, 15kg',
            description:
                'Una dieta completa ed equilibrata formulata per cani adulti, con pollo e riso veri.'
        }
    },
    heaterSoftDeleted: {
        en: {
            title: '150W Ceramic Heat Emitter',
            description:
                'A ceramic heat emitter for reptile terrariums, providing consistent background heat ' +
                'without light. Discontinued — no longer offered for sale.'
        },
        it: {
            title: 'Lampada Ceramica Riscaldante 150W',
            description:
                'Una lampada ceramica riscaldante per terrari di rettili, che fornisce calore di fondo ' +
                'costante senza luce. Prodotto ritirato — non più in vendita.'
        }
    },
    scratchPostOutOfStock: {
        en: {
            title: 'Heavy-Duty Cat Scratching Post',
            description:
                'A tall, sisal-wrapped scratching post built to withstand daily use. Currently ' +
                'unavailable — back in stock soon.'
        },
        it: {
            title: 'Tiragraffi Extra Resistente per Gatti',
            description:
                'Un tiragraffi alto, rivestito in sisal, costruito per resistere a un uso quotidiano. ' +
                'Momentaneamente non disponibile — di nuovo in stock a breve.'
        }
    },
    dogBedPremium: {
        en: {
            title: 'Orthopedic Memory Foam Dog Bed',
            description:
                'A supportive memory foam bed designed to ease pressure on joints, suitable for ' +
                'senior and large-breed dogs.'
        },
        it: {
            title: 'Cuccia Ortopedica in Memory Foam',
            description:
                'Una cuccia in memory foam di supporto, pensata per alleviare la pressione sulle ' +
                'articolazioni, adatta a cani anziani e di taglia grande.'
        }
    },
    bundleInactive: {
        en: {
            title: 'Rabbit Starter Bundle — Hutch, Feeder & Water Bottle',
            description:
                'A complete rabbit housing bundle including hutch, feeder and water bottle. ' +
                'Temporarily disabled while packaging is updated.'
        },
        it: {
            title: 'Kit di Partenza per Conigli — Gabbia, Mangiatoia e Biberon',
            description:
                'Un kit completo per la sistemazione del coniglio, con gabbia, mangiatoia e biberon. ' +
                "Temporaneamente disattivato durante l'aggiornamento della confezione."
        }
    },
    barebones: {
        en: { title: 'Universal Small Animal Water Bottle' },
        it: { title: 'Biberon Universale per Piccoli Animali' }
    }
};

/**
 * Six named products, chosen to cover the branches the storefront and repositories actually
 * exercise rather than to look like a shop on their own — `./products-filler`'s filler rows are what
 * make the catalogue look like a shop. `categories` is non-empty on every RICH record, since a
 * facet endpoint returning `[]` on a fresh install reads as broken rather than empty —
 * `barebones` is the deliberate exception, see its note below.
 */
const namedProducts = [
    makeProduct({
        id: SEED_PRODUCT_IDS.dogFoodStandard,
        title: NAMED_PRODUCT_COPY.dogFoodStandard.en.title,
        description: NAMED_PRODUCT_COPY.dogFoodStandard.en.description,
        price: 68,
        onHand: 30,
        categories: ['dogs', 'food'],
        tags: ['dog-food', 'premium'],
        ...productImages.dogFoodStandard
    }),
    /*
     * The soft-deleted one — exercises the `deletedAt` branch that `isVisibleToCaller` and the
     * repositories' soft-delete filters both check. Exactly one record carries it, independent of
     * the inactive one, so the dataset can tell the two states apart.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.heaterSoftDeleted,
        title: NAMED_PRODUCT_COPY.heaterSoftDeleted.en.title,
        description: NAMED_PRODUCT_COPY.heaterSoftDeleted.en.description,
        price: 55,
        onHand: 12,
        categories: ['reptiles'],
        tags: ['heating', 'reptile'],
        deletedAt: '2024-02-26T23:34:44.832Z',
        ...productImages.heaterSoftDeleted
    }),
    /*
     * `onHand: 0` on purpose — the storefront needs an out-of-stock badge and checkout needs a
     * refusal to exercise. It's `onHand` itself that is zero, not just availability; the other way
     * to be unbuyable (units held, all reserved) is deliberately not seeded — see `./orders`.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.scratchPostOutOfStock,
        title: NAMED_PRODUCT_COPY.scratchPostOutOfStock.en.title,
        description: NAMED_PRODUCT_COPY.scratchPostOutOfStock.en.description,
        price: 45,
        onHand: 0,
        categories: ['cats'],
        tags: ['scratching-post', 'heavy-duty'],
        ...productImages.scratchPostOutOfStock
    }),
    makeProduct({
        id: SEED_PRODUCT_IDS.dogBedPremium,
        title: NAMED_PRODUCT_COPY.dogBedPremium.en.title,
        description: NAMED_PRODUCT_COPY.dogBedPremium.en.description,
        price: 84,
        onHand: 45,
        categories: ['dogs'],
        tags: ['dog-bed', 'premium'],
        ...productImages.dogBedPremium
    }),
    /* The inactive one — soft-deleted's independent twin. `publicScope()` requires active AND not
     * deleted, so from outside these two behave identically while remaining distinct states. */
    makeProduct({
        id: SEED_PRODUCT_IDS.bundleInactive,
        title: NAMED_PRODUCT_COPY.bundleInactive.en.title,
        description: NAMED_PRODUCT_COPY.bundleInactive.en.description,
        price: 96,
        onHand: 18,
        categories: ['rabbits', 'bundles'],
        tags: ['bundle', 'rabbit'],
        active: false,
        ...productImages.bundleInactive
    }),
    /*
     * The minimal one — only `title` and `price`, so every optional field falls to the model's
     * defaults, `imageUrl` included. The others are richly populated and can't catch a card or
     * filter chip that wrongly assumes a description, category or image is present. Public on
     * purpose, so it appears in every list the storefront actually renders.
     */
    makeProduct({
        id: SEED_PRODUCT_IDS.barebones,
        title: NAMED_PRODUCT_COPY.barebones.en.title,
        price: 9
    })
];

/**
 * The combinatorial filler rows from `./products-filler`, each given an id and an image cycled from
 * the fixed 20-image pool — the grid is far larger than that pool, so rows share photos rather
 * than each needing its own. `translations` is excluded from the spread: it isn't a product-schema
 * path, and {@link PRODUCT_COPY_BY_ID} below keeps it addressable by id for the translation batch.
 */
const fillerProductRows = FILLER_PRODUCTS.map(
    ({ translations: _translations, ...product }, index) =>
        makeProduct({
            id: fillerProductId(index),
            ...product,
            ...productImages[
                FILLER_IMAGE_ROLE_KEYS[
                    index % FILLER_IMAGE_ROLE_KEYS.length
                ] as keyof typeof productImages
            ]
        })
);

/** Every demo product: the hand-written catalogue first, then the generated filler rows. */
export const productFixtures = [...namedProducts, ...fillerProductRows];

/**
 * Every product's copy, keyed by its seeded id — the named six from {@link NAMED_PRODUCT_COPY},
 * the filler rows from `./products-filler`'s own `translations` field.
 * {@link seedProductsCollection} is the only reader.
 */
const PRODUCT_COPY_BY_ID: ReadonlyMap<string, ProductCopy> = new Map([
    ...Object.entries(SEED_PRODUCT_IDS).map(
        ([name, id]) => [id, NAMED_PRODUCT_COPY[name as keyof typeof SEED_PRODUCT_IDS]] as const
    ),
    ...FILLER_PRODUCTS.map(
        (product, index) => [fillerProductId(index), product.translations] as const
    )
]);

/**
 * One demo product by id, or a thrown error naming what's missing.
 *
 * `./orders` needs the actual record — it embeds a product SNAPSHOT, not a reference — so the
 * throw lives here, next to the data it validates, instead of every consumer reimplementing it.
 * Returns the fixture type directly; reshaping to `orders`' own snapshot type is the caller's job.
 * @throws {Error} when no demo product carries that id
 */
export const seedProductById = (productId: string): (typeof productFixtures)[number] => {
    const product = productFixtures.find((candidate) => candidate._id.toString() === productId);
    if (!product) throw new Error(`seed fixtures: no product ${productId} in the demo catalogue`);

    return product;
};

/**
 * One locale's copy as the write surface takes it.
 *
 * `description` appears only when that locale states one: `UpsertTranslationRequestFields` is a
 * `Record<string, string>`, which an explicit `undefined` value would fail.
 */
const localeFields = (entry: ProductTranslationFields): Record<string, string> =>
    entry.description === undefined
        ? { title: entry.title }
        : { title: entry.title, description: entry.description };

/**
 * One product's copy, reshaped for `@infrastructure/i18n`'s `plan`/`write` primitives — the
 * fallback locale keyed by {@link getFallbackLocale} rather than a hardcoded `'en'`, and every
 * other locale included only when the fixture states one.
 */
const toUpsertTranslationsRequest = (copy: ProductCopy): UpsertTranslationsRequest => ({
    [getFallbackLocale()]: { fields: localeFields(copy.en) },
    ...(copy.it ? { it: { fields: localeFields(copy.it) } } : {})
});

/**
 * Write one freshly-created product's fallback and Italian rows, through the write surface's own
 * validate/apply primitives (`planTranslations`/`writeTranslations`) rather than a raw repository
 * insert — the derived index column on the product document is already correct (it was written by
 * `insertIfAbsent` above, from the same `title`/`description` this batch also carries), this call adds
 * the `translations` rows a real editor's write would have produced alongside it.
 *
 * @throws {Error} if the batch fails to validate — a bug in the fixture data, never a caller input
 */
const writeSeedTranslations = (productId: string): Promise<void> => {
    const copy = PRODUCT_COPY_BY_ID.get(productId);
    if (!copy) throw new Error(`seed fixtures: no translation copy for product ${productId}`);

    return planTranslations('product', toUpsertTranslationsRequest(copy)).then((plan) => {
        if (!isTranslationPlan(plan))
            throw new Error(
                `seed fixtures: product ${productId} translations failed to plan: ${JSON.stringify(plan)}`
            );

        // `translatedBy: undefined` — this is a system seed, not a human translator's write.
        return writeTranslations('product', productId, plan, undefined).then(() => undefined);
    });
};

/**
 * Seed this collection. Declared in `./index`'s `shopModules`; walked by `seedShop`.
 *
 * Each row writes twice: {@link insertIfAbsent} for the product document (its `title`/
 * `description` are the derived index column, in the fallback locale), then
 * {@link writeSeedTranslations} for its `translations` rows — only when the product was actually
 * `'created'`, so a re-run against an already-seeded database does not redo the translation write
 * for a row `insertIfAbsent` itself skipped.
 *
 * Goes through `planTranslations`/`writeTranslations` rather than `productService.writeCreate`:
 * that service validates its body against `zodProductCreateSchema` (generated from `POST
 * /products`), which has no `id` field and always mints a fresh one — this dataset needs the
 * factory's PINNED id, both for idempotent re-seeding and because `./orders`/`./cart`/`./wishlist`
 * address specific rows by their known id. `planTranslations`/`writeTranslations` are the same two
 * primitives that service composes; calling them directly is the closest a seeder with its own id
 * can get to "the new write surface".
 *
 * Depends on `./locales` having already seeded the fallback and `it` locale rows — `scenarios/apply.ts`
 * seeds `locales` before every other module for exactly this reason.
 */
export const seedProductsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(productFixtures.map((product) => insertIfAbsent(productRepository, product))).then(
        (outcomes) =>
            Promise.all(
                productFixtures.map((product, index) =>
                    outcomes[index] === 'created'
                        ? writeSeedTranslations(product._id.toString())
                        : Promise.resolve()
                )
            ).then(() => outcomes)
    );

/**
 * Which of `./module`'s declared `scenario.shop` guarantees the seeded catalogue actually
 * satisfies — `scenarios/check.ts` calls this, never the fixtures directly, so a guarantee
 * failing here means the DATABASE lost the state, not just that a comment says it exists.
 *
 * `description: ''` is the schema's own default (`@modules/products/model`), so it uniquely
 * picks out {@link SEED_PRODUCT_IDS}'s `barebones` row: every other seeded product, named or
 * filler, states a real description.
 */
export const checkProductGuarantees = (): Promise<string[]> =>
    Promise.all([
        productModel.exists({ deletedAt: { $exists: true } }),
        productModel.exists({ active: false }),
        productModel.exists({ onHand: 0 }),
        productModel.exists({ description: '' })
    ]).then(([softDeleted, inactive, outOfStock, barebones]) =>
        [
            softDeleted && 'product.softDeleted',
            inactive && 'product.inactive',
            outOfStock && 'product.outOfStock',
            barebones && 'product.barebones'
        ].filter((guarantee): guarantee is string => guarantee !== null)
    );
