import { Request, Response } from "express";
import type { CastError } from "mongoose";
import Products from "../../models/products";
import { databaseErrorInterpreter } from "../../utils/helpers-errors";
import { getFullUrl } from "../../utils/helpers-files";
import { getPagination } from "../../utils/helpers-pagination";
import { rejectResponse, successResponse } from "../../utils/response";
import type { IPaginationParameters } from "../../types";
import { getFilters, addQuantityToProduct, type IGetAllProductsQueries } from "./get-all-products";

/**
 * Get all products
 *
 * @param req
 * @param res
 */
export default async (req: Request<IPaginationParameters, unknown, IGetAllProductsQueries>, res: Response) => {
    // Pagination
    const pagination = getPagination(req.params);
    // Filters
    const whereCondition = getFilters(req.query, req.user);
    // Query total records
    let paginationTotalItems = 0;

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    await Products.countDocuments(whereCondition)
        .then(num => {
            paginationTotalItems = num;
            // true search
            // eslint-disable-next-line unicorn/no-array-callback-reference
            return Products.find(whereCondition)
                // eliminate mongoose metadata
                .lean({ virtuals: true })
                // selected page items START (skip the first results)
                .skip((pagination.current - 1) * pagination.size)
                // selected page items END (cut all exceeding results)
                .limit(pagination.size)
        })
        // then show products (and pagination)
        .then(async (productListRaw) => {
            // Search for the correspondent product in the cart and add the quantity (in the cart) to the product info
            const productsInCart = req.user ? await req.user.cartGet() : [];
            const productList = productListRaw.map(product => ({
                ...addQuantityToProduct(product, productsInCart),
                imageUrl: getFullUrl(req, product.imageUrl),
            }));
            return successResponse(res, {
                page: pagination.current,
                total: paginationTotalItems,
                totalPages: Math.ceil(paginationTotalItems / pagination.size),
                items: productList
            })
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}