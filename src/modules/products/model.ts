import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { CreateProductBody } from '@api/schemas.zod';
import { applySerialization } from '@infrastructure/persistence/serialize';
import type { Product } from '@types';

/**
 * Product Document interface
 */
export interface IProductDocument
    extends Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>, Document {
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

/**
 * Product Document instance methods
 */
export type IProductMethods = unknown;

/**
 * Product Document model type.
 * Business logic (search, remove, validate) lives in the service (`./service`); queries live in
 * the repository (`./repository`).
 */
export type IProductModel = Model<IProductDocument, unknown, IProductMethods>;

/**
 * Zod Schema for product data validation.
 * Built on the orval-generated CreateProductBody (kept in sync with openapi.yaml), so only
 * fields needing custom i18n messages or stricter rules are overridden — every constraint the
 * contract declares and this file does not mention still applies.
 * Used by the service layer to validate incoming product data.
 *
 * `.min(0)` restates `openapi.yaml`'s `minimum: 0` rather than relying on the generated schema
 * to carry it: `.extend()` REPLACES a field outright, so an override that forgets a constraint
 * silently drops it. That is exactly what happened here — the previous `price` override was a
 * bare `.number().refine(v => v != null)` (itself dead: `z.number()` already rejects null and
 * undefined), which meant a negative price was accepted despite the contract forbidding it.
 *
 * Every message is a THUNK — `error: () => t('…')`, never `error: t('…')`. See the same note in
 * `user-validation.ts`: eager `t()` runs before `i18next.init()` and Zod discards the resulting
 * `undefined`; a thunk runs at parse time, in the request's locale.
 */
export const zodProductSchema = CreateProductBody.extend({
    title: z
        .string()
        .min(1, { error: () => t('products.field-title-required') })
        .min(5, { error: () => t('products.field-title-min') }),

    price: z
        .number({ error: () => t('products.field-price-invalid') })
        .min(0, { error: () => t('products.field-price-min') })
});

/**
 * Mongoose Schema for the Product model
 */
export const productSchema = new Schema<IProductDocument, IProductModel, IProductMethods>(
    {
        title: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        /*
         * Units the shop can still sell. Written ONLY through the repository's conditional
         * `adjustStock` helpers outside the admin product form — checkout decrements, a customer
         * cancel restores — so no read-modify-write ever races two buyers over the last unit.
         * `default: 100`, declared in `openapi.yaml` on both create bodies: a demo's new product
         * exists to be bought, and an undeclared default is one the paired frontend's mock has
         * to guess at. Existing rows are backfilled by
         * `db/migrations/20260813091000-product-stock-column.js`.
         */
        stock: {
            type: Number,
            default: 100,
            min: 0
        },
        description: {
            type: String,
            default: ''
        },
        imageUrl: {
            type: String,
            default: process.env.NODE_DEFAULT_IMAGE_PRODUCT ?? 'https://placekitten.com/400/400'
        },
        categories: {
            type: [String],
            default: []
        },
        tags: {
            type: [String],
            default: []
        },
        /*
         * Independent of `deletedAt`, and deliberately so. A product can be active or not
         * whether or not it has been soft-deleted; the two are separate facts about it. They
         * share an effect rather than a value — `publicScope()` requires active AND not deleted,
         * so from outside a soft-deleted product behaves exactly like an inactive one, while
         * inside they remain distinct states.
         *
         * Defaults to `true`, and `openapi.yaml` says so on both create bodies — an undeclared
         * default is one the paired frontend's mock has to guess at, and a guess that differs
         * here is a disagreement no test on either side can see.
         */
        active: {
            type: Boolean,
            default: true
        },
        deletedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

/*
 * Indexes.
 *
 * Declared on the schema, which makes this the one place that decides what is indexed here.
 *
 * The names are given rather than derived: Mongo identifies an index by its name as much as by
 * its key, so asking for a key it already holds under a different name fails at startup instead
 * of doing nothing. These are the names the databases already carry.
 */
/* Default listing sort. */
productSchema.index({ createdAt: -1 }, { name: 'products_createdAt' });
/* Storefront filters: active + not soft-deleted (`publicScope` in `./repository`). */
productSchema.index({ active: 1, deletedAt: 1 }, { name: 'products_active_deletedAt' });

/**
 * Normalizes a serialized product: `_id` → `id`, drops `__v`.
 * Exported so lean/aggregate results (which bypass `toJSON`) can be mapped
 * through the same logic — see `./service` `search()`.
 */
export const applyProductTransform = applySerialization(productSchema);

/**
 * Mongoose model for product CRUD operations.
 */
export const productModel = model<IProductDocument, IProductModel>('Product', productSchema);
