import type { Request, Response, NextFunction } from "express";
import type { WhereOptions } from "sequelize";
import Products from "../../models/products";
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
const paginationPageSize = parseInt(process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE || "10");

/**
 * Get all products page
 *
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetAllProductsParameters }, res: Response, next: NextFunction) => {
    // Empty where
    const whereCondition: WhereOptions = {};

    // current page
    const paginationCurrentPage = parseInt(req.params.page || "1");
    // Query total records
    let paginationTotalItems = 0;

    // // Commented because we have scopes to restrict non-admin vision
    // if (!req.session.user?.admin) {
    //     whereCondition.active = true;
    //     whereCondition.deletedAt = null;
    // }

    // // Add filter conditions
    // // Alternative: Products.scope("lowCost").findAll()
    // if (req.params.maxPrice)
    //     whereCondition.price = {
    //         [Op.lt]: parseInt(req.params.maxPrice)
    //     };

    // First retrieve total count
    Products
        .scope(req.session.user?.admin ? "admin" : undefined)
        .count({
            where: whereCondition
        })
        .then(num => {
            paginationTotalItems = num;
            // true search
            return Products
                // Only admin can see non-active and (soft) deleted products
                .scope(req.session.user?.admin ? "admin" : undefined)
                .findAll({
                    where: whereCondition,
                    offset: (paginationCurrentPage - 1) * paginationPageSize,
                    limit: paginationPageSize
                })
        })
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
        .catch((error: Error) =>
            next(new ExtendedError("500", 500, error.message, false)))
}