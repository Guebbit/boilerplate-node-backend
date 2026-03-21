import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from "zod";
import { t } from "i18next";
import type { Product } from "@api/api"

/**
 * Product Document interface
 */
export interface IProductDocument extends Product, Document {}

/**
 * Product Document instance methods
 */
export type IProductMethods = unknown;

/**
 * Product Document model type.
 * Business logic (search, remove, validate) is now handled by the
 * service layer (src/services/products.ts) and repository layer
 * (src/repositories/products.ts).
 */
export type IProductModel = Model<IProductDocument, unknown, IProductMethods>;

/**
 * Zod Schema for product data validation.
 * Used by the service layer to validate incoming product data.
 */
export const zodProductSchema = z.object({
    id: z.number().nullable().optional(),

    title: z
        .string()
        .min(1, { error: t('ecommerce.product-invalid-title-required') })
        .min(5, { error: t('ecommerce.product-invalid-title-min') }),

    price: z
        .number({ error: t('ecommerce.product-invalid-price-invalid') })
        .refine((v) => v !== undefined && v !== null, {
            error: t('ecommerce.product-invalid-price-required'),
        }),

    imageUrl: z
        .string()
        .min(1, { error: t('ecommerce.product-invalid-image-required') }),

    active: z.boolean().nullable().optional(),
    createdAt: z.date().nullable().optional(),
    updatedAt: z.date().nullable().optional(),
    deletedAt: z.date().nullable().optional(),
});

/**
 * Mongoose Schema for the Product model
 */
export const productSchema = new Schema<IProductDocument, IProductModel, IProductMethods>({
    title: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        default: ""
    },
    imageUrl: {
        type: String,
        default: "https://placekitten.com/400/400"
    },
    active: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date
    },
}, {
    timestamps: true
});

export const productModel = model<IProductDocument, IProductModel>('Product', productSchema);

export default productModel;