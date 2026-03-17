import { model, Schema, Types } from 'mongoose';
import type { Document, Model, PipelineStage, QueryFilter } from 'mongoose';
import { z } from "zod";
import { t } from "i18next";
import { generateReject, generateSuccess, IResponseReject, type IResponseSuccess } from "../utils/response";
import { deleteFile } from "../utils/filesystem-helpers";
import Users from "./users";
import { SearchProductsRequest, ProductsResponse, Product } from "@api/api"

/**
 * Product Document interface
 */
export interface IProductDocument extends Product, Document {}

/**
 * Product Document instance methods
 */
export type IProductMethods = unknown;

/**
 * Product Document static methods
 */
export interface IProductModel extends Model<IProductDocument, unknown, IProductMethods> {
    validateData: (data: Product) => string[],
    productRemoveById: (id: string, hardDelete?: boolean) => Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject>;
    productRemove: (product: IProductDocument, hardDelete?: boolean) => Promise<IResponseSuccess<IProductDocument> | IResponseSuccess<undefined> | IResponseReject>;
    search: (search: SearchProductsRequest, scope?: QueryFilter<IProductDocument>) => Promise<ProductsResponse>;
}

/**
 * Zod Schema
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
 * Search products (DTO-friendly) — matches POST /products/search in OpenAPI
 *
 * Filters: id (product), text, minPrice, maxPrice
 * Pagination: page (1-based), pageSize
 *
 * @param search
 * @param scope - optional additional filters (e.g. non-admin: active=true, deletedAt=undefined)
 */
productSchema.static('search', async function (
    search: SearchProductsRequest = {},
    scope: QueryFilter<IProductDocument> = {}
): Promise<ProductsResponse> {
    const page = Math.max(1, Number(search.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(search.pageSize ?? 10) || 10));
    const skip = (page - 1) * pageSize;

    const where: QueryFilter<IProductDocument> = { ...scope };

    if (search.id && String(search.id).trim() !== "") {
        where._id = new Types.ObjectId(String(search.id));
    }

    if (search.minPrice !== undefined && search.minPrice !== null && !Number.isNaN(Number(search.minPrice))) {
        // TODO CHECK
        where.price = { ...where.price, $gte: Number(search.minPrice) };
    }

    if (search.maxPrice !== undefined && search.maxPrice !== null && !Number.isNaN(Number(search.maxPrice))) {
        // TODO CHECK
        where.price = { ...where.price, $lte: Number(search.maxPrice) };
    }

    if (search.text && String(search.text).trim() !== "") {
        const text = String(search.text).trim();
        // Simple, effective search across title/description (case-insensitive)
        where.$or = [
            { title: { $regex: text, $options: "i" } },
            { description: { $regex: text, $options: "i" } },
        ];
    }

    const totalItems = await this.countDocuments(where);
    const items = await this.find(where)
        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize);

    return {
        items,
        meta: {
            page,
            pageSize,
            totalItems,
            totalPages: Math.ceil(totalItems / pageSize),
        }
    };
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
            if (!product)
                return generateReject(404, "404", [ t("ecommerce.product-not-found") ]);
            // HARD delete
            if (hardDelete)
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
productSchema.static('validateData', function (productData: Product): string[] {
    /**
     * Validation
     */
    const parseResult = zodProductSchema
        .safeParse(productData);

    /**
     * Validation errors
     */
    if (!parseResult.success)
        return parseResult.error.issues.map(({ message }) => message)

    return [];
});

export const productModel = model<IProductDocument, IProductModel>('Product', productSchema);

export default productModel;