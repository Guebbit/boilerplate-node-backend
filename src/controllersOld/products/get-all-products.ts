import { Request, Response } from "express";
import type { CastError, FilterQuery, ObjectId } from "mongoose";
import Products, { type IProductDocument } from "../../models/products";
import { databaseErrorInterpreter } from "../../utils/helpers-errors";
import { getFullUrl } from "../../utils/helpers-files";
import { rejectResponse, successResponse } from "../../utils/response";
import type { IPaginationParameters } from "../../types";
import { EUserRoles, ICartItem, type IUserDocument } from "../../models/users";

/**
 * Query parameters
 */
export interface IGetAllProductsQueries {
    maxPrice?: string
    minPrice?: string
    text?: string
}

/**
 *
 * @param query
 * @param user
 */
export const getFilters = (query: IGetAllProductsQueries, user?: IUserDocument) => {
    let filters: FilterQuery<IProductDocument> = {};

    /**
     * Price filters
     */
    if (query.maxPrice)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        filters.price = {
            ...filters.price,
            $lte: Number.parseFloat(query.maxPrice)
        };
    if (query.minPrice)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        filters.price = {
            ...filters.price,
            $gte: Number.parseFloat(query.minPrice)
        };

    /**
     * Text filters
     * TODO ARRAY
     */
    if (query.text)
        filters = {
            ...filters,
            $or: [
                {
                    name: {
                        $regex: query.text,
                        $options: 'i'
                    }
                },
                {
                    description: {
                        $regex: query.text,
                        $options: 'i'
                    }
                },
            ],
        };

    /**
     * User role filters
     * Only admin can see non-active and (soft) deleted products
     */
    if (!user?.roles.includes(EUserRoles.ADMIN)) {
        filters.active = true;
        filters.deletedAt = undefined;
    }

    return filters;
}

export const addQuantityToProduct = (product: IProductDocument, productsInCart: ICartItem[]) => {
    // @ts-expect-error should accept ObjectId
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const { quantity = 0 } = productsInCart.find(({ product }) => ((product as IProductDocument)._id as ObjectId).equals(product._id as ObjectId)) ?? {};
    return {
        ...product,
        quantity
    }
}

/**
 * Get all products
 *
 * @param req
 * @param res
 */
export default async (req: Request<IPaginationParameters, unknown, IGetAllProductsQueries>, res: Response) => {
    // Filters
    const whereCondition = getFilters(req.query, req.user);

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    // eslint-disable-next-line unicorn/no-array-callback-reference
    await Products.find(whereCondition)
        // eliminate mongoose metadata
        .lean({ virtuals: true })
        // then show products (and pagination)
        .then(async (productListRaw) => {
            // Search for the correspondent product in the cart and add the quantity (in the cart) to the product info
            const productsInCart = req.user ? await req.user.cartGet() : [];
            const productList = productListRaw.map(product => ({
                ...addQuantityToProduct(product, productsInCart),
                imageUrl: getFullUrl(req, product.imageUrl),
            }));
            return successResponse(res, productList)
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}