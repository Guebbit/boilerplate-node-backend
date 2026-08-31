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
import { t } from '@infrastructure/i18n';
import { CreateProductBody } from '@api/schemas.zod';
import { applySerialization } from '@infrastructure/persistence/serialize';
import type { Product } from '@types';

/**
 * A product's stored fields, without Mongoose's document machinery — `Product` from
 * `openapi.yaml` with its three dates as real `Date`s. `available` is omitted: it's derived at
 * serialization, never persisted. Kept separate from `ProductDocument` because `orders` embeds
 * this on line items, which aren't full documents and so can't satisfy that type.
 */
export interface ProductSnapshot extends Omit<
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
 * Product Document interface — the stored fields, plus everything Mongoose adds.
 */
export interface ProductDocument extends ProductSnapshot, Document {
    /**
     * Document-only bookkeeping for the image digest pipeline — deliberately NOT on
     * `ProductSnapshot`, so it never rides along on the embedded copy `orders` keeps of a product.
     * See the schema field's own comment for what it means.
     */
    pendingImageKey?: string;
}

/**
 * Product Document instance methods
 */
export type ProductMethods = unknown;

/**
 * Product Document model type.
 * Business logic (search, remove, validate) lives in the service (`./service`); queries live in
 * the repository (`./repository`).
 */
export type ProductModel = Model<ProductDocument, unknown, ProductMethods>;

/**
 * Zod schema for product data, built on the generated `CreateProductBody` — only fields needing
 * custom i18n messages or stricter rules are overridden; every other contract constraint applies.
 *
 * `.min(0)` restates the contract's `minimum: 0`: `.extend()` REPLACES a field outright, so an
 * override that forgets a constraint silently drops it. A prior bare `.refine()` override did
 * exactly that, letting a negative price through despite the contract forbidding it.
 */
export const zodProductSchema = CreateProductBody.extend({
    // Thunks, not eager calls: t() must run at parse time (post i18next.init()), see `users/model.ts`.
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
export const productSchema = new Schema<ProductDocument, ProductModel, ProductMethods>(
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
         * came from a remote/default url rather than an upload (see IMAGE_PIPELINE_PLAN.md).
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
    after: applyProductAvailability
});

/**
 * Mongoose model for product CRUD operations.
 */
export const productModel = model<ProductDocument, ProductModel>('Product', productSchema);
