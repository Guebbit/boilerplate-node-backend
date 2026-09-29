/**
 * @module
 * The product Mongoose schema, its Zod validation, and the serialization transform that derives
 * `available` from the two stock counters. `onHand` and `reserved` are declared here because this
 * module owns the collection but are written only by `@modules/inventory` — see that module's
 * docblock. `available` is never stored: `applyProductTransform` computes it at serialization
 * time so no writer can let it drift. See docs/modules/products.md.
 */

import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import { z } from 'zod';
import { getFallbackLocale, t } from '@infrastructure/i18n';
import { CreateProductBody, ReplaceProductByIdBody, UpdateProductByIdBody } from '@api/schemas.zod';
import { applySerialization } from '@infrastructure/persistence/serialize';
import type { TranslationFieldIssue } from '@kernel/registry';
import { availableStock } from './domain/stock';
import { productCurrency } from './config';
import type { Product } from '@types';

/**
 * A product's stored fields, without Mongoose's document machinery — `Product` from
 * `openapi.yaml` with its three dates as real `Date`s. `available` is omitted: it's derived at
 * serialization, never persisted. Kept separate from `ProductDocument` so a plain object (a lean
 * read, a fixture) can satisfy the shape without also satisfying `Document`.
 */
export interface ProductRecord extends Omit<
    Product,
    'id' | 'available' | 'currency' | 'createdAt' | 'updatedAt' | 'deletedAt'
> {
    /** Spelled exactly as Mongoose spells it on a document, so `ProductDocument` can extend this. */
    _id: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

/**
 * A product as an ORDER LINE remembers it: `ProductRecord` without `onHand`/`reserved` — the two
 * fields that describe the WAREHOUSE, right now, rather than what a customer saw and bought.
 * `orders/model.ts` embeds a Mongoose schema that mirrors this shape (not `productSchema` itself,
 * so the two counters are never even reachable to store), and its `OrderDocumentItem.product` is
 * typed by this, not by `ProductRecord`.
 */
export type ProductSnapshot = Omit<ProductRecord, 'onHand' | 'reserved'>;

/**
 * Product Document interface — the stored fields, plus everything Mongoose adds.
 */
export interface ProductDocument extends ProductRecord, Document {
    /** String version of _id — provided by Mongoose's Document getter. */
    id: string;

    /**
     * Document-only bookkeeping for the image digest pipeline — deliberately NOT on
     * `ProductSnapshot`, so it never rides along on the embedded copy `orders` keeps of a product.
     * See the schema field's own comment for what it means.
     */
    pendingImageKey?: string;
}

/**
 * Product Document model type.
 * Business logic (search, remove, validate) lives in the service (`./service`); queries live in
 * the repository (`./repository`).
 */
export type ProductModel = Model<ProductDocument, Record<string, never>, unknown>;

/**
 * One locale's words for a product, with the same title-length rule this schema has always
 * enforced — applied per locale here so a Zod issue's path comes out `translations.<locale>.title`,
 * naming which language failed, instead of a bare `title`.
 */
const zodProductTranslationEntry = z.strictObject({
    // Thunks, not eager calls: t() must run at parse time (post i18next.init()), see `users/model.ts`.
    title: z
        .string({ error: () => t('products.field-title-required') })
        .min(1, { error: () => t('products.field-title-required') })
        .min(5, { error: () => t('products.field-title-min') }),
    description: z
        .string()
        .min(1, { error: () => t('products.field-description-empty') })
        .optional()
});

/**
 * `PATCH`'s locale entry: RFC 7396 one level down, so every field is optional and a description
 * may be `null` to clear it. A title has no legal cleared state — an empty locale is deleted with
 * the locale's own `null` — so it stays a string with the same length rules as on create.
 */
const zodProductTranslationPatch = z.strictObject({
    title: zodProductTranslationEntry.shape.title.optional(),
    description: zodProductTranslationEntry.shape.description.nullable()
});

/**
 * The rules {@link zodProductTranslationPatch} holds, as the `translatables` registry's
 * `checkFields`: what keeps the generic translator's door from landing a title under its minimum
 * or an empty description on a product.
 *
 * @param fields - one locale's changes: a string sets, `null` clears
 * @returns one issue per broken rule, each naming its field
 */
export const checkProductTranslationFields = (
    fields: Record<string, string | null>
): TranslationFieldIssue[] => {
    const parsed = zodProductTranslationPatch.safeParse(fields);
    if (parsed.success) return [];

    return parsed.error.issues.map((issue) => ({
        field: String(issue.path[0] ?? ''),
        message: issue.message
    }));
};

/**
 * `ProductTranslationsPatch` restated for Zod: an object merges into a locale, `null` deletes it,
 * absence leaves it untouched.
 */
const zodProductTranslationsPatch = z.record(z.string(), zodProductTranslationPatch.nullable());

/**
 * `ProductTranslationsWrite` restated for Zod: a locale entry upserts, `null` deletes, absence
 * leaves it untouched — see the `PATCH /products/{id}` operation description for the full
 * three-way table.
 */
const zodProductTranslations = z.record(z.string(), zodProductTranslationEntry.nullable());

/**
 * The fallback locale (`NODE_FALLBACK_LOCALE`) MUST NOT be `null` — deleting it would leave the
 * product with nothing to fall back to. Shared by create, PUT and PATCH; `mustBePresent` is the
 * one thing that differs: create and PUT send the whole set, so they also refuse its ABSENCE,
 * where a PATCH's omission only leaves the stored row alone.
 */
const refineFallbackLocale = (
    translations: Record<string, unknown> | undefined,
    context: z.RefinementCtx,
    mustBePresent: boolean
): void => {
    const fallback = getFallbackLocale();
    const entry = translations?.[fallback];

    if (entry === null)
        context.addIssue({
            code: 'custom',
            message: t('products.field-translations-fallback-null', { locale: fallback }),
            path: ['translations', fallback]
        });
    else if (mustBePresent && entry === undefined)
        context.addIssue({
            code: 'custom',
            message: t('products.field-translations-fallback-required', { locale: fallback }),
            path: ['translations', fallback]
        });
};

/**
 * Zod schema for a product CREATE, built on the generated `CreateProductBody` — only fields
 * needing custom i18n messages, stricter rules, or a fallback-locale invariant are overridden;
 * every other contract constraint applies.
 *
 * `.min(0)` restates the contract's `minimum: 0`: `.extend()` REPLACES a field outright, so an
 * override that forgets a constraint silently drops it. A prior bare `.refine()` override did
 * exactly that, letting a negative price through despite the contract forbidding it.
 */
export const zodProductCreateSchema = CreateProductBody.extend({
    price: z
        .number({ error: () => t('products.field-price-invalid') })
        .min(0, { error: () => t('products.field-price-min') }),
    translations: zodProductTranslations
}).superRefine((data, context) => refineFallbackLocale(data.translations, context, true));

/**
 * Zod schema for a product PUT, built on the generated `ReplaceProductByIdBody` — every writable
 * field stays genuinely required there; this only swaps in the custom-message price and the
 * fallback-locale guard. `mustBePresent: true`, as on create: a PUT's `translations` is the whole
 * set, so a locale it omits is deleted — and the fallback one can never be.
 */
export const zodProductReplaceSchema = ReplaceProductByIdBody.extend({
    price: z
        .number({ error: () => t('products.field-price-invalid') })
        .min(0, { error: () => t('products.field-price-min') }),
    translations: zodProductTranslations
}).superRefine((data, context) => refineFallbackLocale(data.translations, context, true));

/**
 * Zod schema for a product PATCH, built on the generated `UpdateProductByIdBody` — every field is
 * already optional there; this only adds the fallback-locale guard, which stays a refusal even
 * when the field is optional overall.
 */
export const zodProductUpdateSchema = UpdateProductByIdBody.extend({
    price: z
        .number({ error: () => t('products.field-price-invalid') })
        .min(0, { error: () => t('products.field-price-min') })
        .optional(),
    translations: zodProductTranslationsPatch.optional()
}).superRefine((data, context) => refineFallbackLocale(data.translations, context, false));

/**
 * Mongoose Schema for the Product model
 */
export const productSchema = new Schema<ProductDocument, ProductModel, unknown>(
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
         * Absent means the shop's standard rate — `resolveTaxRate` (`./tax`) never returns "no
         * rate", it only narrows which one. `enum` matches the contract's `TaxClass` exactly, so
         * an invalid value fails at the database layer as well as at validation.
         */
        taxClass: {
            type: String,
            enum: ['reduced', 'zero']
        },
        /*
         * WHY `taxClass` is `zero`, when it is — meaningless otherwise. Absent means `standard`,
         * same convention as `taxClass` leaving its own absence to mean the shop's default rate.
         * `enum` matches the contract's `RateType` exactly, same reasoning as `taxClass` above.
         */
        rateType: {
            type: String,
            enum: ['standard', 'zero-rated', 'exempt']
        },
        /*
         * SH4: an optional, deployment-chosen stock-keeping unit. Uniqueness is `products_sku`
         * below (`unique: true, sparse: true`), not enforced here — the schema declares the
         * shape, the index is what makes a collision a database fact rather than a race two
         * concurrent writes could both slip past.
         */
        sku: {
            type: String
        },
        /*
         * `onHand` (units that exist) and `reserved` (units an open order has claimed) — not a
         * single `stock` column, which would have to be decremented at order time and so remove
         * unpaid units from the world rather than merely reserve them. `available` derives from
         * both at serialization, never stored.
         *
         * NEITHER IS WRITTEN HERE: every change goes through `@modules/inventory`, which owns the
         * transitions and ledger. This module only declares the columns, since it owns the collection.
         */
        onHand: {
            type: Number,
            default: 0,
            min: 0
        },
        reserved: {
            type: Number,
            default: 0,
            min: 0
        },
        description: {
            type: String,
            default: ''
        },
        // No default: a product with no image has no field, and the client draws its own
        // placeholder. `imageUrl: null` on an update unsets it.
        imageUrl: {
            type: String
        },
        /*
         * Set together with `imageUrl` by `readUploadedImage` — never independently, and never by
         * a client: `ThumbnailUrl` is `readOnly` on the contract. Absent for a product whose image
         * came from a remote/default url rather than an upload.
         */
        thumbnailUrl: {
            type: String
        },
        /*
         * The quarantine key of an upload still awaiting its digest job — set alongside the
         * pending-image placeholder, cleared by the writeback once the job completes. Internal
         * bookkeeping only: never part of the `Product` contract, never read by a controller.
         * See `ImageTarget` in `kernel/registry.ts`.
         */
        pendingImageKey: {
            type: String
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
         * Independent of `deletedAt`: a product can be active/inactive regardless of deletion.
         * `publicScope()` requires both active AND not deleted, so a soft-deleted product looks
         * inactive from outside while staying a distinct state internally. Defaults `true`,
         * matching `openapi.yaml`, so the frontend mock doesn't have to guess.
         */
        active: {
            type: Boolean,
            default: true
        },
        /*
         * Default `true`, matching `openapi.yaml`: most products are physical. `false` marks a
         * digital good — `cart` reads this to decide whether a checkout even needs a shipping
         * method, not this module's own concern.
         */
        requiresShipping: {
            type: Boolean,
            default: true
        },
        /*
         * Art. 16 of the Consumer Rights Directive: personalised, sealed-hygiene or perishable
         * goods carry no right of withdrawal. Frozen onto each order line; `returns` reads it.
         */
        noWithdrawal: {
            type: Boolean,
            default: false
        },
        /*
         * Grams, optional. Absent counts as 0 wherever a basket's weight is summed
         * (`delivery`'s shipping-method filter, `cart`'s checkout refusal) — not a concern of
         * this module's own, which is why there is no default here the way `onHand` has one.
         */
        weight: {
            type: Number,
            min: 0
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
 * Declared here so this file is the one place deciding what's indexed. Named explicitly: Mongo
 * matches an index by name as much as by key, so requesting an existing key under a different
 * name fails at startup rather than silently doing nothing — these are the existing names.
 */
/* Default listing sort. */
productSchema.index({ createdAt: -1 }, { name: 'products_createdAt' });
/* Storefront filters: active + not soft-deleted (`publicScope` in `./repository`). */
productSchema.index({ active: 1, deletedAt: 1 }, { name: 'products_active_deletedAt' });
/*
 * SH4: unique when set. Sparse, same reasoning as `orders`' `orders_transferReference` — most
 * products never carry a `sku` at all, and an unfiltered unique index would index every absent
 * value as an equal `null`, colliding on the second such product.
 */
productSchema.index({ sku: 1 }, { name: 'products_sku', unique: true, sparse: true });

/**
 * Derives `available` and stamps the live `currency`, at the single serialization point every
 * product response passes through — listing, detail, both write paths and an order's embedded
 * snapshots all agree. Neither is stored: `currency` is this deployment's CURRENT
 * `NODE_DEFAULT_CURRENCY`, read fresh rather than frozen onto the catalogue row.
 */
const applyProductAvailability = (serialized: Record<string, unknown>) => {
    const onHand = typeof serialized.onHand === 'number' ? serialized.onHand : 0;
    const reserved = typeof serialized.reserved === 'number' ? serialized.reserved : 0;
    serialized.available = availableStock(onHand, reserved);
    serialized.currency = productCurrency();
};

/**
 * Normalizes a serialized product: shared `_id`→`id` and `__v` removal, plus deriving
 * `available`. Exported so lean/aggregate results (which bypass `toJSON`) can reuse it —
 * see `./service` `search()`.
 */
export const applyProductTransform = applySerialization(productSchema, {
    // Document-only bookkeeping for the image digest pipeline, never part of the `Product`
    // contract — see the schema field's own comment. `additionalProperties: false` makes a leaked
    // `pendingImageKey` fail response validation rather than just look untidy.
    omit: ['pendingImageKey'],
    after: applyProductAvailability
});

/**
 * Mongoose model for product CRUD operations.
 */
export const productModel = model<ProductDocument, ProductModel>('Product', productSchema);
