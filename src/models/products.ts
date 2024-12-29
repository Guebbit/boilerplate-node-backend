import {model, Schema, Types} from 'mongoose';
import type { Document, Model } from 'mongoose';
import { z } from "zod";
import { t } from "i18next";
import {generateReject, generateSuccess, IResponseReject, type IResponseSuccess} from "../utils/response";
import {deleteFile} from "../utils/filesystem-helpers";
import Users from "./users";

/**
 * Product type
 */
export interface IProduct {
    title: string;
    price: number;
    imageUrl: string;
    description: string;
    active: boolean;
    deletedAt?: Date;
}

/**
 * Product Document interface
 */
export interface IProductDocument extends IProduct, Document{}

/**
 * Product Document instance methods
 */
export type IProductMethods = unknown;

/**
 * Product Document static methods
 */
export interface IProductModel extends Model<IProductDocument, unknown, IProductMethods>{
    validateData: (data: IProduct) => string[],
    productRemoveById: (id: string, hardDelete?: boolean) => Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject>;
    productRemove: (product: IProductDocument, hardDelete?: boolean) => Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject>;
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
 * STATIC method
 * Remove product from database by ID
 *
 * @param id
 * @param hardDelete
 */
productSchema.static('productRemoveById', async function (id: string, hardDelete = false): Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject> {
    return productModel
        .findById(id)
        .then((product) => {
            // not found, something happened
            if(!product)
                return generateReject(404, "404", [t("ecommerce.product-not-found")]);
            // HARD delete
            if(hardDelete)
                return Users.productRemoveFromCarts((product._id as Types.ObjectId).toString())
                    .then(() => product.deleteOne())
                    .then(() => deleteFile((process.env.NODE_PUBLIC_PATH ?? "public") + product.imageUrl))
                    .then(() => generateSuccess(undefined, 200, t("ecommerce.product-hard-deleted")));
            // If deletedAt already present: it's soft deleted: RESTORE
            product.deletedAt = product.deletedAt ? undefined : new Date();
            // SOFT delete
            return Users.productRemoveFromCarts((product._id as Types.ObjectId).toString())
                .then(async () => generateSuccess(await product.save(), 200, t("ecommerce.product-soft-deleted")));
        })
});

/**
 * STATIC method
 * Remove product from database
 *
 * @param product
 * @param hardDelete
 */
productSchema.static('productRemove', async function (product: IProductDocument, hardDelete = false): Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject> {
    return this.productRemoveById((product._id as Types.ObjectId).toString(), hardDelete as boolean);
});

/**
 * STATIC method
 * Data validation
 * Check if product info are compliant
 *
 * @param productData
 */
productSchema.static('validateData', function (productData: IProduct): string[] {
    /**
     * Validation
     */
    const parseResult = zodProductSchema
        .safeParse(productData);

    /**
     * Validation errors
     */
    if (!parseResult.success)
        return parseResult.error.issues.map(({message}) => message)

    return [];
});

export const productModel = model<IProductDocument, IProductModel>('Product', productSchema);

export default productModel;
