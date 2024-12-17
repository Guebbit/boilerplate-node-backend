import { Request, Response, NextFunction } from "express";
import type {CastError, FilterQuery} from "mongoose";
import Products, { type IProductDocument } from "../../models/products";
import { ExtendedError } from "../../utils/error-helpers";

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
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetAllProductsParameters }, res: Response, next: NextFunction) => {
    // Empty where
    const whereCondition :FilterQuery<IProductDocument> = {};

    // current page
    const paginationCurrentPage = Number.parseInt(req.params.page ?? "1");
    // Query total records
    let paginationTotalItems = 0;

    // Only admin can see non-active and (soft) deleted products
    if(!req.session.user?.admin){
        whereCondition.active = true;
        whereCondition.deletedAt = undefined;
    }

    // Add filter conditions
    // if(req.params.maxPrice)
    //     whereCondition.price.$lt = parseInt(req.params.maxPrice);

    // First retrieve total count (estimatedDocumentCount is faster but doesn't use filters)
    Products.countDocuments(whereCondition)
        .then(num => {
            paginationTotalItems = num;
            // true search
            return Products.find(whereCondition)
                // skip the first results
                .skip((paginationCurrentPage - 1) * paginationPageSize)
                // cut all exceeding results
                .limit(paginationPageSize)
        })
        // then show products (and pagination)
        .then((productList) =>
            res.render('products/list', {
                pageMetaTitle: 'All Products',
                pageMetaLinks: [
                    "/css/product.css"
                ],
                productList,
                productsTotal: paginationTotalItems,
                pageCurrent: paginationCurrentPage,
                pageTotal: Math.ceil(paginationTotalItems / paginationPageSize)
            })
        )
        .catch((error: CastError) =>
            next(new ExtendedError(error.kind, Number.parseInt(error.message), false)))
}