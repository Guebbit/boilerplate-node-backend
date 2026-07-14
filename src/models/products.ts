import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from 'zod';
import { t } from 'i18next';
import { CreateProductBody } from '@api/schemas.zod';
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
 * Business logic (search, remove, validate) is now handled by the
 * service layer (src/services/products.ts) and repository layer
 * (src/repositories/products.ts).
 */
export type IProductModel = Model<IProductDocument, unknown, IProductMethods>;

/**
 * Zod Schema for product data validation.
 * Built on the orval-generated CreateProductBody (kept in sync with
 * openapi.yaml); imageUrl is overridden back to a plain string since it
 * holds a relative upload path (see resolveImageUrl), not an absolute URL.
 * Used by the service layer to validate incoming product data.
 */
export const zodProductSchema = CreateProductBody.extend({
    title: z
        .string()
        .min(1, { error: t('ecommerce.product-invalid-title-required') })
        .min(5, { error: t('ecommerce.product-invalid-title-min') }),

    price: z
        .number({ error: t('ecommerce.product-invalid-price-invalid') })
        .refine((v) => v !== undefined && v !== null, {
            error: t('ecommerce.product-invalid-price-required')
        }),

    imageUrl: z.string()
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
        active: {
            type: Boolean,
            default: false
        },
        deletedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

/**
 * Mongoose model for product CRUD operations.
 */
export const productModel = model<IProductDocument, IProductModel>('Product', productSchema);
