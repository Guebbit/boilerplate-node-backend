/**
 * @module
 * The catalogue's combinatorial filler layer — plain nested-loop combinations over a handful of
 * hand-picked words, not a random generator. `tests/support/contract-data.ts` explains why this
 * repo doesn't reach for `@faker-js/faker` (ESM-only, breaks ts-jest); a demo catalogue that must
 * be byte-stable every time `assembleDemoDataset()` runs has even less reason to involve
 * randomness than a test file does. `./demo` attaches an id and an image to each row; this file
 * only knows words.
 *
 * Animal × product-type × tier — a pet-supply retailer's catalogue, in plain professional
 * copy. `FILLER_IMAGE_ROLE_KEYS` is a fixed pool independent of that grid's size: growing it
 * (more animals, more types, more tiers) never requires downloading a new photo, it only means
 * more rows share the ones `npm run seed:images` already fetched.
 */

/** The image roles `npm run seed:images` populated under this key — see
 * `./demo-images.generated.json`. Fixed at 20 regardless of how large {@link FILLER_PRODUCTS}
 * grows; `./demo` cycles through them by index. */
export const FILLER_IMAGE_ROLE_KEYS: string[] = Array.from(
    { length: 20 },
    (_unused, index) => `filler-${String(index).padStart(2, '0')}`
);

/** One species line of the catalogue, and the category slug its products are filed under. */
interface AnimalLine {
    name: string;
    slug: string;
}

const ANIMALS: AnimalLine[] = [
    { name: 'Dog', slug: 'dogs' },
    { name: 'Cat', slug: 'cats' },
    { name: 'Rabbit', slug: 'rabbits' },
    { name: 'Bird', slug: 'birds' },
    { name: 'Reptile', slug: 'reptiles' },
    { name: 'Small Animal', slug: 'small-animals' }
];

/** One product line, generic enough to apply sensibly across every {@link ANIMALS} entry. */
interface ProductType {
    name: string;
    slug: string;
    /** Completes "designed for {animal} owners: {blurb}." */
    blurb: string;
    /** Pre-tier price, in whole currency units. */
    basePrice: number;
}

const PRODUCT_TYPES: ProductType[] = [
    {
        name: 'Bed',
        slug: 'bed',
        blurb: 'a supportive resting surface designed for daily use',
        basePrice: 60
    },
    {
        name: 'Carrier',
        slug: 'carrier',
        blurb: 'a secure enclosure for transport and travel',
        basePrice: 70
    },
    {
        name: 'Feeding Bowl',
        slug: 'feeding-bowl',
        blurb: 'a stable, easy-to-clean feeding solution',
        basePrice: 15
    },
    {
        name: 'Water Dispenser',
        slug: 'water-dispenser',
        blurb: 'a leak-resistant system for a constant water supply',
        basePrice: 20
    },
    {
        name: 'Grooming Kit',
        slug: 'grooming-kit',
        blurb: 'a set of tools for routine coat and nail care',
        basePrice: 25
    },
    {
        name: 'Enrichment Toy',
        slug: 'enrichment-toy',
        blurb: 'an interactive item that supports natural behaviour',
        basePrice: 12
    },
    {
        name: 'Health Supplement',
        slug: 'health-supplement',
        blurb: 'a formulation intended to support everyday wellbeing',
        basePrice: 18
    }
];

/** A quality/price tier, applied on top of a {@link ProductType}'s base price. */
interface Tier {
    name: string;
    slug: string;
    priceMultiplier: number;
    /** Completes "{qualifier} {animal} owners: ...". */
    qualifier: string;
}

const TIERS: Tier[] = [
    {
        name: 'Standard',
        slug: 'standard',
        priceMultiplier: 1,
        qualifier: 'A dependable, no-frills option for'
    },
    {
        name: 'Premium',
        slug: 'premium',
        priceMultiplier: 1.6,
        qualifier: 'A higher-grade option, built for'
    },
    {
        name: 'Heavy-Duty',
        slug: 'heavy-duty',
        priceMultiplier: 1.3,
        qualifier: 'Reinforced construction intended for demanding, everyday use by'
    }
];

/** One filler row's fields, before `./demo` attaches an id and an image. */
export interface FillerProduct {
    /** Stable across regenerations — `${animal}-${type}-${tier}` slugs, human-readable in a diff. */
    key: string;
    title: string;
    description: string;
    price: number;
    onHand: number;
    categories: string[];
    tags: string[];
}

/**
 * Every animal × product-type × tier combination — {@link ANIMALS}`.length` ×
 * {@link PRODUCT_TYPES}`.length` × {@link TIERS}`.length` rows, each active, non-deleted and in
 * stock: `seed-conformance.test.ts`'s "exactly one soft-deleted/inactive product" only holds if
 * nothing here can be mistaken for one — those states live on the six named rows in `./demo`.
 */
export const FILLER_PRODUCTS: FillerProduct[] = ANIMALS.flatMap((animal, animalIndex) =>
    PRODUCT_TYPES.flatMap((type, typeIndex) =>
        TIERS.map((tier, tierIndex) => ({
            key: `${animal.slug}-${type.slug}-${tier.slug}`,
            title: `${tier.name} ${animal.name} ${type.name}`,
            description: `${tier.qualifier} ${animal.name.toLowerCase()} owners: ${type.blurb}.`,
            price: Math.round(type.basePrice * tier.priceMultiplier) + animalIndex * 2,
            onHand: Math.max(5, 60 - tierIndex * 15 - typeIndex * 3 + animalIndex * 2),
            categories: [animal.slug],
            tags: [type.slug, tier.slug]
        }))
    )
);

/**
 * A stable 24-hex id for filler row `index` — never `new Types.ObjectId()`, whose default is
 * time-based and would make the same row seed a different id on every run, breaking both
 * `db:seed`'s idempotent upsert and `assembleDemoDataset()`'s byte-stability.
 *
 * @param index - the row's position in {@link FILLER_PRODUCTS}
 * @returns a syntactically valid, deterministic ObjectId hex string
 */
export const fillerProductId = (index: number): string =>
    `67f0c1${index.toString(16).padStart(18, '0')}`;
