import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from "zod"

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

export interface IProductMethods {}

export interface IProductModel extends Model<IProductDocument, {}, IProductMethods>{
    validateData: (data: IProduct) => string[]
}

/**
 * Zod Schema
 */
export const ZodProductSchema =
    z.object({
        id: z.number().nullish().optional(),
        title: z
            .string({
                required_error: "Title is required",
            })
            .min(5, "Title is too short"),
        price: z.number(),
        imageUrl: z
            .string({
                required_error: "Image is required",
            }),
        active: z.boolean().nullish().optional(),
        createdAt: z.date().nullish().optional(),
        updatedAt: z.date().nullish().optional(),
        deletedAt: z.date().nullish().optional(),
    });

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
productSchema.static('validateData', function({
    title,
    imageUrl,
    price,
    description,
    active,
}: IProduct) {
    /**
     * Validation
     */
    const parseResult = ZodProductSchema
        .safeParse({
            title,
            imageUrl,
            price,
            description,
            active,
        });

    /**
     * Validation error
     */
    if (!parseResult.success)
        return parseResult.error.issues.reduce((errorArray, { message }) => {
            errorArray.push(message);
            return errorArray;
        }, [] as string[]);
    
    return [];
});

export default model<IProductDocument, IProductModel>('Product', productSchema);
