/**
 * @module
 * The product catalogue: public read, admin write, soft delete with restore. Depends on nothing —
 * a leaf module, and everything downstream (cart, orders, stock) is a statement about a product,
 * which is what makes this the one model other contexts conform to. It stays a leaf by emitting
 * `product.deleted` and `product.created` rather than importing a sibling directly.
 *
 * Not in the import graph: `onHand` and `reserved` are declared on this document and written ONLY
 *   by `inventory`, including the opening count — `product.created` is how `inventory` (which
 *   already imports this module) gives a new product its stock without this module importing back.
 *   This module never moves either counter itself. See that module's docblock.
 *
 * See: docs/modules/products.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { productRepository } from './repository';
import { invalidVatRateConfig } from './config';
import './events';

/** This module's manifest entry: routes, its VAT config gate, locales, the image target and the translatable fields. */
export default {
    name: 'products',
    basePath: '/products',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: [
        'products.self.read',
        'products.any.read',
        'products.any.create',
        'products.any.update',
        'products.any.delete'
    ],
    routes: router,
    // The catalogue resolves a product's tax class into a rate, so the rates are this module's
    // config — `orders` only freezes the number `resolveTaxRate` hands it.
    requiredConfig: [
        { key: 'NODE_VAT_RATE_DEFAULT', minLength: 1 },
        { key: 'NODE_VAT_RATE_REDUCED', minLength: 1 }
    ],
    // `requiredConfig` catches an EMPTY rate; only a range check catches `2.2` or `abc`, which
    // would otherwise misprice every invoice silently. See `./config`.
    customCheck: invalidVatRateConfig,
    locales: path.join(__dirname, 'locales'),
    imageTargets: { products: { writeback: productRepository.writebackImage } },
    /*
     * `title`/`description` are a translated product's DERIVED index column, not its own data —
     * kept only so Mongo has something to sort and index on. `products` is both the collection a
     * translation write updates and the cache tag it must clear.
     */
    translatables: {
        product: { collection: 'products', fields: ['title', 'description'], cacheTag: 'products' }
    },
    /**
     * The catalogue states the storefront and the repositories actually branch on.
     *
     * Four are the hidden or empty ones; `inStock` and `rich` are the two ORDINARY rows a screen
     * needs a subject for — anything buyable, and one with every optional field populated, which
     * is what a detail page and a product form have to render to be worth auditing.
     * `scenarios/subjects.ts` pins the row behind each, and
     * `tests/integration/scenarios/shop.test.ts` checks each really has the property.
     */
    scenario: {
        shop: [
            'product.softDeleted',
            'product.inactive',
            'product.outOfStock',
            'product.barebones',
            'product.inStock',
            'product.rich'
        ]
    }
} satisfies AppModule;
