import { model, Schema } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from "zod";
import { t } from "i18next";

/**
 * Typing
 */
export interface IProduct {
    title: string;
    price: number;
    imageUrl: string;
    description: string;
    active: boolean;
    deletedAt?: Date;
}

export interface IProductDocument extends IProduct, Document{}

export type IProductMethods = unknown

export interface IProductModel extends Model<IProductDocument, unknown, IProductMethods>{
    validateData: (data: IProduct) => string[]
}

/**
 * Zod Schema
 */
export const zodProductSchema =
    z.object({
        id: z.number().nullish().optional(),
        title: z
            .string({
                required_error: t('ecommerce.product-invalid-title-required'),
            })
            .min(5, t('ecommerce.product-invalid-title-min')),
        price: z.number({
            required_error: t('ecommerce.product-invalid-price-required'),
            invalid_type_error: t('ecommerce.product-invalid-price-invalid')
        }),
        imageUrl: z
            .string({
                required_error: t('ecommerce.product-invalid-image-required'),
            }),
        active: z.boolean().nullish().optional(),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
        deletedAt: z.date().nullish().optional(),
    });

/**
 *
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

/**
 * Data validation
 * Check if product info are compliant
 */
productSchema.static('validateData', function(productData: IProduct) {
    /**
     * Validation
     */
    const parseResult = zodProductSchema
        .safeParse(productData);

    /**
     * Validation error
     */
    if (!parseResult.success)
        return parseResult.error.issues.reduce<string[]>((errorArray, { message }) => {
            errorArray.push(message);
            return errorArray;
        }, []);
    
    return [];
});

export default model<IProductDocument, IProductModel>('Product', productSchema);
