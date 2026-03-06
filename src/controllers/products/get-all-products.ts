import { Request, Response, NextFunction } from "express";
import type { CastError, FilterQuery } from "mongoose";
import Products, { type IProductDocument } from "../../models/products";
import { databaseErrorConverter } from "../../utils/error-helpers";
import type { ObjectId } from "mongodb";
import type { ProductListResponse } from "@api/api";

/**
 * Url parameters
 */
export interface IGetAllProductsParameters {
    page?: string,
}

/**
 * Max items per page
 */
const paginationPageSize = Number.parseInt(process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ?? "10");

/**
 * Get all products
 *
 * @param request
 * @param response
 * @param next
 */
export const getAllProducts = async (request: Request & {
    params: IGetAllProductsParameters
}, response: Response, next: NextFunction) => {
    // Empty where
    const whereCondition: FilterQuery<IProductDocument> = {};

    // current page
    const paginationCurrentPage = Number.parseInt(request.params.page ?? "1");
    // Query total records
    let paginationTotalItems = 0;

    // Only admin can see non-active and (soft) deleted products
    if (!request.session.user?.admin) {
        whereCondition.active = true;
        whereCondition.deletedAt = undefined;
    }

    // Add filter conditions
    // if(req.params.maxPrice)
    //     whereCondition.price.$lt = parseInt(req.params.maxPrice);

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    await Products.countDocuments(whereCondition)
        .then(number_ => {
            paginationTotalItems = number_;
            // true search
            // eslint-disable-next-line unicorn/no-array-callback-reference
            return Products.find(whereCondition)
                // eliminate mongoose metadata
                .lean()
                // skip the first results
                .skip((paginationCurrentPage - 1) * paginationPageSize)
                // cut all exceeding results
                .limit(paginationPageSize)
        })
        // then show products (and pagination)
        .then(async (productListRaw) => {
            // Search for the correspondent product in the cart and add the quantity (in the cart) to the product info
            const productsInCart = request.user ? await request.user.cartGet() : [];
            const productList = productListRaw.map(product => {
                const { quantity = 0 } = productsInCart.find(cartProduct => cartProduct.product._id.equals(product._id as ObjectId)) ?? {};
                return {
                    ...product,
                    quantity
                }
            });
            // render page
            return response.render('products/list', {
                pageMetaTitle: 'All Products',
                pageMetaLinks: [
                    "/css/product.css"
                ],
                productList,
                productsTotal: paginationTotalItems,
                pageCurrent: paginationCurrentPage,
                pageTotal: Math.ceil(paginationTotalItems / paginationPageSize)
            })
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)))
}