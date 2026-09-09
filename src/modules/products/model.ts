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
import { CreateProductBody, UpdateProductByIdBody } from '@api/schemas.zod';
import { applySerialization } from '@infrastructure/persistence/serialize';
import type { Product } from '@types';

/**
 * A product's stored fields, without Mongoose's document machinery — `Product` from
 * `openapi.yaml` with its three dates as real `Date`s. `available` is omitted: it's derived at
 * serialization, never persisted. Kept separate from `ProductDocument` so a plain object (a lean
 * read, a fixture) can satisfy the shape without also satisfying `Document`.
 */
export interface ProductRecord extends Omit<
    Product,
    'id' | 'available' | 'createdAt' | 'updatedAt' | 'deletedAt'
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
        .string()
        .min(1, { error: () => t('products.field-title-required') })
        .min(5, { error: () => t('products.field-title-min') }),
    description: z.string().optional()
});

/**
 * `ProductTranslationsWrite` restated for Zod: a locale entry upserts, `null` deletes, absence
 * leaves it untouched — see the `PATCH /products/{id}` operation description for the full
 * three-way table.
 */
const zodProductTranslations = z.record(z.string(), zodProductTranslationEntry.nullable());

/**
 * The fallback locale (`NODE_FALLBACK_LOCALE`) MUST NOT be `null` — deleting it would leave the
 * product with nothing to fall back to. Shared between create and update; `mustBePresent` is the
 * one thing that differs: a fresh product has no prior row to leave alone, so create additionally
 * refuses its ABSENCE, where update does not.
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
 * Zod schema for a product PATCH, built on the generated `UpdateProductByIdBody` — every field is
 * already optional there; this only adds the fallback-locale guard, which stays a refusal even
 * when the field is optional overall.
 */
export const zodProductUpdateSchema = UpdateProductByIdBody.extend({
    price: z
        .number({ error: () => t('products.field-price-invalid') })
        .min(0, { error: () => t('products.field-price-min') })
        .optional(),
    translations: zodProductTranslations.optional()
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
            default: 100,
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
        imageUrl: {
            type: String,
            default: process.env.NODE_DEFAULT_IMAGE_PRODUCT ?? 'https://placekitten.com/400/400'
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

/**
 * Derives `available` — what a customer may buy — from the two stored counters, at the single
 * serialization point every product response passes through, so listing, detail, both write
 * paths and an order's embedded snapshots all agree.
 *
 * Clamped at zero: `reserved > onHand` should be unreachable via `@modules/inventory`'s
 * conditional transitions, but "should be unreachable" isn't a reason to serve a negative count.
 */
const applyProductAvailability = (serialized: Record<string, unknown>) => {
    const onHand = typeof serialized.onHand === 'number' ? serialized.onHand : 0;
    const reserved = typeof serialized.reserved === 'number' ? serialized.reserved : 0;
    serialized.available = Math.max(0, onHand - reserved);
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
 * Maps a document straight onto the `Product` contract: `id` from the Mongoose getter, `available`
 * derived from the two stock counters (never stored), the three dates ISO-stringified. Same
 * reasoning as `users/model.ts`'s `toUser`.
 */
export const toProduct = (document: ProductDocument): Product => {
    const onHand = document.onHand ?? 0;
    const reserved = document.reserved ?? 0;

    return {
        id: document.id,
        title: document.title,
        price: document.price,
        available: Math.max(0, onHand - reserved),
        ...(document.onHand === undefined ? {} : { onHand: document.onHand }),
        ...(document.reserved === undefined ? {} : { reserved: document.reserved }),
        ...(document.description === undefined ? {} : { description: document.description }),
        ...(document.active === undefined ? {} : { active: document.active }),
        ...(document.requiresShipping === undefined
            ? {}
            : { requiresShipping: document.requiresShipping }),
        ...(document.imageUrl === undefined ? {} : { imageUrl: document.imageUrl }),
        ...(document.thumbnailUrl === undefined ? {} : { thumbnailUrl: document.thumbnailUrl }),
        ...(document.categories === undefined ? {} : { categories: document.categories }),
        ...(document.tags === undefined ? {} : { tags: document.tags }),
        ...(document.createdAt ? { createdAt: document.createdAt.toISOString() } : {}),
        ...(document.updatedAt ? { updatedAt: document.updatedAt.toISOString() } : {}),
        ...(document.deletedAt ? { deletedAt: document.deletedAt.toISOString() } : {})
    };
};

/**
 * Mongoose model for product CRUD operations.
 */
export const productModel = model<ProductDocument, ProductModel>('Product', productSchema);
