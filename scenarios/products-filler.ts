/**
 * @module
 * The catalogue's combinatorial filler layer — plain nested-loop combinations over a handful of
 * hand-picked words, not a random generator. `tests/support/contract-data.ts` explains why this
 * repo doesn't reach for `@faker-js/faker` (ESM-only, breaks ts-jest); a demo catalogue that must
 * produce the same rows on every boot and every restore has even less reason to involve
 * randomness than a test file does. `./products` attaches an id and an image to each row; this
 * file only knows words.
 *
 * Animal × product-type × tier — a pet-supply retailer's catalogue, in plain professional copy,
 * English and Italian. `FILLER_IMAGE_ROLE_KEYS` is a fixed pool independent of that grid's size:
 * growing it (more animals, more types, more tiers) never requires downloading a new photo, it
 * only means more rows share the ones `npm run scenario:images` already fetched.
 */

/** The image roles `npm run scenario:images` populated under this key — see
 * `./products-images.generated.json`. Fixed at 20 regardless of how large {@link FILLER_PRODUCTS}
 * grows; `./products` cycles through them by index. */
export const FILLER_IMAGE_ROLE_KEYS: string[] = Array.from(
    { length: 20 },
    (_unused, index) => `filler-${String(index).padStart(2, '0')}`
);

/** One species line of the catalogue, and the category slug its products are filed under. */
interface AnimalLine {
    name: string;
    slug: string;
    /** The Italian catalogue's counterpart — plural, since every template needs "per i
     * proprietari di {animali}", never the singular. */
    it: { namePlural: string };
}

/** The six species the grid is built over — one axis of the generated catalogue. */
const ANIMALS: AnimalLine[] = [
    { name: 'Dog', slug: 'dogs', it: { namePlural: 'Cani' } },
    { name: 'Cat', slug: 'cats', it: { namePlural: 'Gatti' } },
    { name: 'Rabbit', slug: 'rabbits', it: { namePlural: 'Conigli' } },
    { name: 'Bird', slug: 'birds', it: { namePlural: 'Uccelli' } },
    { name: 'Reptile', slug: 'reptiles', it: { namePlural: 'Rettili' } },
    { name: 'Small Animal', slug: 'small-animals', it: { namePlural: 'Piccoli Animali' } }
];

/** One product line, generic enough to apply sensibly across every {@link ANIMALS} entry. */
interface ProductType {
    name: string;
    slug: string;
    /** Completes "designed for {animal} owners: {blurb}." */
    blurb: string;
    /** Pre-tier price, in whole currency units. */
    basePrice: number;
    /** The Italian catalogue's counterpart — `name` is gender-neutral in how {@link TIERS}
     * combines it in a title, `blurb` completes "...proprietari di {animali}: {blurb}.". */
    it: { name: string; blurb: string };
}

/** The product lines every species gets — the second axis of the grid. */
const PRODUCT_TYPES: ProductType[] = [
    {
        name: 'Bed',
        slug: 'bed',
        blurb: 'a supportive resting surface designed for daily use',
        basePrice: 60,
        it: {
            name: 'Cuccia',
            blurb: 'una superficie di riposo di supporto pensata per un uso quotidiano'
        }
    },
    {
        name: 'Carrier',
        slug: 'carrier',
        blurb: 'a secure enclosure for transport and travel',
        basePrice: 70,
        it: {
            name: 'Trasportino',
            blurb: 'un alloggiamento sicuro per il trasporto e i viaggi'
        }
    },
    {
        name: 'Feeding Bowl',
        slug: 'feeding-bowl',
        blurb: 'a stable, easy-to-clean feeding solution',
        basePrice: 15,
        it: {
            name: 'Ciotola per Alimenti',
            blurb: "una soluzione per l'alimentazione stabile e facile da pulire"
        }
    },
    {
        name: 'Water Dispenser',
        slug: 'water-dispenser',
        blurb: 'a leak-resistant system for a constant water supply',
        basePrice: 20,
        it: {
            name: "Erogatore d'Acqua",
            blurb: "un sistema resistente alle perdite per un rifornimento d'acqua costante"
        }
    },
    {
        name: 'Grooming Kit',
        slug: 'grooming-kit',
        blurb: 'a set of tools for routine coat and nail care',
        basePrice: 25,
        it: {
            name: 'Kit per la Toelettatura',
            blurb: 'un set di strumenti per la cura quotidiana del pelo e delle unghie'
        }
    },
    {
        name: 'Enrichment Toy',
        slug: 'enrichment-toy',
        blurb: 'an interactive item that supports natural behaviour',
        basePrice: 12,
        it: {
            name: 'Giocattolo Interattivo',
            blurb: 'un accessorio interattivo che favorisce i comportamenti naturali'
        }
    },
    {
        name: 'Health Supplement',
        slug: 'health-supplement',
        blurb: 'a formulation intended to support everyday wellbeing',
        basePrice: 18,
        it: {
            name: 'Integratore per la Salute',
            blurb: 'una formulazione pensata per il benessere quotidiano'
        }
    }
];

/** A quality/price tier, applied on top of a {@link ProductType}'s base price. */
interface Tier {
    name: string;
    slug: string;
    priceMultiplier: number;
    /** Completes "{qualifier} {animal} owners: ...". */
    qualifier: string;
    /** The Italian catalogue's counterpart. `qualifier` ends in "per i proprietari di", so the
     * template only has to append the animal and the colon — see {@link FILLER_PRODUCTS}. */
    it: { name: string; qualifier: string };
}

/** The quality tiers each species/type pair is offered at — the third axis, and the price dial. */
const TIERS: Tier[] = [
    {
        name: 'Standard',
        slug: 'standard',
        priceMultiplier: 1,
        qualifier: 'A dependable, no-frills option for',
        it: {
            name: 'Standard',
            qualifier: "Un'opzione affidabile e senza fronzoli per i proprietari di"
        }
    },
    {
        name: 'Premium',
        slug: 'premium',
        priceMultiplier: 1.6,
        qualifier: 'A higher-grade option, built for',
        it: {
            name: 'Premium',
            qualifier: "Un'opzione di qualità superiore, pensata per i proprietari di"
        }
    },
    {
        name: 'Heavy-Duty',
        slug: 'heavy-duty',
        priceMultiplier: 1.3,
        qualifier: 'Reinforced construction intended for demanding, everyday use by',
        it: {
            // Invariant across the type nouns' genders (bed/carrier/bowl/... are a mix of
            // masculine and feminine), unlike an inflected adjective would be.
            name: 'Extra Resistente',
            qualifier:
                'Una struttura rinforzata, pensata per un uso quotidiano e intenso, per i proprietari di'
        }
    }
];

/** One locale's title/description for a filler row. */
interface FillerCopy {
    title: string;
    description: string;
}

/** One filler row's fields, before `./products` attaches an id and an image. */
export interface FillerProduct {
    /** Stable across regenerations — `${animal}-${type}-${tier}` slugs, human-readable in a diff. */
    key: string;
    title: string;
    description: string;
    price: number;
    onHand: number;
    categories: string[];
    tags: string[];
    /** Both locales' copy for the write surface's translation batch (see `./products`). `en` is
     * built from the same template call as the flat `title`/`description` above, so the two can
     * never drift apart. */
    translations: { en: FillerCopy; it: FillerCopy };
}

/**
 * Every animal × product-type × tier combination — {@link ANIMALS}`.length` ×
 * {@link PRODUCT_TYPES}`.length` × {@link TIERS}`.length` rows, each active, non-deleted and in
 * stock. The soft-deleted, inactive and out-of-stock states live on the six named rows in
 * `./products`, so a filler row is never mistaken for one of them.
 */
export const FILLER_PRODUCTS: FillerProduct[] = ANIMALS.flatMap((animal, animalIndex) =>
    PRODUCT_TYPES.flatMap((type, typeIndex) =>
        TIERS.map((tier, tierIndex) => {
            const en: FillerCopy = {
                title: `${tier.name} ${animal.name} ${type.name}`,
                description: `${tier.qualifier} ${animal.name.toLowerCase()} owners: ${type.blurb}.`
            };
            const it: FillerCopy = {
                title: `${type.it.name} ${tier.it.name} per ${animal.it.namePlural}`,
                description: `${tier.it.qualifier} ${animal.it.namePlural.toLowerCase()}: ${type.it.blurb}.`
            };

            return {
                key: `${animal.slug}-${type.slug}-${tier.slug}`,
                title: en.title,
                description: en.description,
                price: Math.round(type.basePrice * tier.priceMultiplier) + animalIndex * 2,
                onHand: Math.max(5, 60 - tierIndex * 15 - typeIndex * 3 + animalIndex * 2),
                categories: [animal.slug],
                tags: [type.slug, tier.slug],
                translations: { en, it }
            };
        })
    )
);

/**
 * A stable 24-hex id for filler row `index` — never `new Types.ObjectId()`, whose default is
 * time-based and would make the same row seed a different id on every run, breaking
 * `scenario:apply`'s idempotent upsert.
 *
 * @param index - the row's position in {@link FILLER_PRODUCTS}
 * @returns a syntactically valid, deterministic ObjectId hex string
 */
export const fillerProductId = (index: number): string =>
    `67f0c1${index.toString(16).padStart(18, '0')}`;
