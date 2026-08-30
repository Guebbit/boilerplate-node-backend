import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import { z } from 'zod';
import { t } from '@infrastructure/i18n';
import { CreateProductBody } from '@api/schemas.zod';
import { applySerialization } from '@infrastructure/persistence/serialize';
import type { Product } from '@types';

/**
 * A product's stored FIELDS, without the Mongoose document machinery.
 *
 * The contract owns the field list — this is `Product` from `openapi.yaml` with the three dates
 * swapped from ISO strings to real `Date`s, which is the one thing storage genuinely disagrees with
 * the wire about.
 *
 * `available` is omitted rather than inherited, for the reason `orders` omits its three totals: it
 * is required on the wire but never persisted — `applyProductTransform` derives it from `onHand`
 * and `reserved` at serialization time — so declaring it here would claim a stored column that
 * does not exist, and every producer of a snapshot would have to invent a value for it.
 *
 * It exists separately from `ProductDocument` because a product is stored in two places, and only
 * one of them is a document. `orders` EMBEDS a copy of this on every line item, and an embedded
 * subdocument has none of `Document`'s 54 methods. Typing that copy as `ProductDocument` was an
 * over-claim that nothing could satisfy, so every producer of one had to cast: the order service
 * twice, over a comment conceding that a `lean()` result is "compatible at runtime", and the order
 * factory once more on the way in.
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
 * Every message is a THUNK — `error: () => t('…')`, never `error: t('…')`. See the same note on
 * `zodUserSchema` in `users/model.ts`: eager `t()` runs before `i18next.init()` and Zod discards
 * the resulting `undefined`; a thunk runs at parse time, in the request's locale.
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
         * The two counters. `onHand` is how many units exist; `reserved` is how many of them an
         * open order has claimed. What a customer may buy is neither — it is the difference,
         * derived at serialization below rather than stored, so it cannot drift from its inputs.
         *
         * A single `stock` column could not tell those apart: it had to be decremented the instant
         * an order was placed, so an unpaid order removed units from the world rather than merely
         * spoken for them.
         *
         * NEITHER IS WRITTEN HERE, or by this module. Every change goes through
         * `@modules/inventory`, which owns the transitions, writes them conditionally, and records
         * each in its ledger. This module declares the columns because it owns the collection; it
         * does not decide what they may become.
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
 * Derives `available` — what a customer may actually buy — from the two stored counters.
 *
 * Done at the single serialization point every product response passes through, exactly as
 * `orders` derives its three totals, so the listing, the detail read, both write paths and the
 * embedded snapshots on an order all agree. That agreement is what lets `openapi.yaml` declare
 * the field at all.
 *
 * Derived rather than stored on purpose. A third column would have to be kept correct by every
 * writer of the other two, which is precisely the class of drift this rework exists to remove:
 * a number that is computed cannot be stale, and `available` is only ever one subtraction away.
 *
 * Clamped at zero. `reserved > onHand` should be unreachable — every transition in
 * `@modules/inventory` is conditional on it staying false — but "should be unreachable" is not
 * a reason to serve a negative count to a storefront that will render it.
 */
const applyProductAvailability = (serialized: Record<string, unknown>) => {
    const onHand = typeof serialized.onHand === 'number' ? serialized.onHand : 0;
    const reserved = typeof serialized.reserved === 'number' ? serialized.reserved : 0;
    serialized.available = Math.max(0, onHand - reserved);
};

/**
 * Normalizes a serialized product: the shared `_id` → `id` and `__v` removal, plus this
 * collection's own job — deriving `available` from `onHand` and `reserved`.
 * Exported so lean/aggregate results (which bypass `toJSON`) can be mapped
 * through the same logic — see `./service` `search()`.
 */
export const applyProductTransform = applySerialization(productSchema, {
    after: applyProductAvailability
});

/**
 * Mongoose model for product CRUD operations.
 */
export const productModel = model<ProductDocument, ProductModel>('Product', productSchema);
