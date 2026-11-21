/**
 * @module
 * The product catalogue: public read, admin write, soft delete with restore. Everything
 * downstream (cart, orders, stock) is a statement about a product, so this is the one model other
 * contexts conform to; it reads only `shop` and emits `product.deleted` and `product.created`
 * instead of importing a sibling.
 *
 * Shares:  `onHand` and `reserved` with `inventory`: declared here, written ONLY there, including
 *          the opening count (`product.created` is how `inventory` gives a new product its stock).
 *
 * @see docs/modules/products.md#its-neighbourhood
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { productRepository } from './repository';
import { productTranslationFieldRules } from './model';
import { productsConfig } from './config';
import { productsBrowserEvents } from './browser-events';

/** This module's manifest entry: routes, its VAT config gate, locales, the image target and the translatable fields. */
export default {
    name: 'products',
    mounts: [{ basePath: '/products', routes: router }],
    /**
     * The catalogue resolves a product's tax class into a rate, so the rates are this module's
     * config — `orders` only freezes the number `resolveTaxRate` hands it.
     */
    config: [productsConfig.slice],
    locales: path.join(__dirname, 'locales'),
    imageTargets: { products: { writeback: productRepository.writebackImage } },
    /**
     * `title`/`description` are a translated product's DERIVED index column, not its own data —
     * kept only so Mongo has something to sort and index on. `products` is both the collection a
     * translation write updates and the cache tag it must clear.
     */
    translatables: {
        product: {
            collection: 'products',
            cacheTag: 'products',
            ...productRepository.translatable,
            fieldRules: productTranslationFieldRules
        }
    },
    /**
     * The catalogue states the storefront and the repositories actually branch on: the hidden,
     * off-sale and empty ones, plus the two ORDINARY rows a screen needs a subject for (anything
     * buyable, and one with every optional field populated).
     *
     * `digital`:      the one row with `requiresShipping: false`.
     * `lowStock`:     one unit, on no seeded order; the subject of the last-unit race.
     * `noWithdrawal`: a made-to-order row (EU Art. 16(c)); `returns` refuses its lines.
     * `heavy`:        past the express weight ceiling, inside standard's; the shipping-weight
     * refusal.
     *
     * `scenarios/subjects.ts` pins the row behind each, and
     * `tests/integration/scenarios/shop.test.ts` checks each really has the property.
     */
    scenario: {
        shop: [
            'product.softDeleted',
            'product.inactive',
            'product.offSale',
            'product.outOfStock',
            'product.barebones',
            'product.inStock',
            'product.rich',
            'product.digital',
            'product.lowStock',
            'product.noWithdrawal',
            'product.heavy'
        ]
    },
    /** Reported by the browser through `analytics`' relay; shapes: `openapi.browser-events.yaml`. */
    browserEvents: productsBrowserEvents,
    /**
     * The catalogue — nothing here is scoped to a person. An order's line embeds its own frozen
     * snapshot, and that copy is `orders`' section to export, not this module's.
     */
    personalData: 'none'
} satisfies AppModule;
