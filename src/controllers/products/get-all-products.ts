import type { Request, Response, NextFunction } from "express";
import type {DatabaseError, ValidationError, WhereOptions} from "sequelize";
import Products from "../../models/products";
import {databaseErrorConverter} from "../../utils/error-helpers";
import CartItems from "../../models/cart-items";

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
 * Get all products page
 *
 * @param request
 * @param response
 * @param next
 */
export const getAllProducts = (request: Request & { params: IGetAllProductsParameters }, response: Response, next: NextFunction) => {
    // Empty where
    const whereCondition: WhereOptions = {};

    // current page
    const paginationCurrentPage = Number.parseInt(request.params.page ?? "1");
    // Query total records
    let paginationTotalItems = 0;

    // // Commented because we have scopes to restrict non-admin vision
    // if (!request.session.user?.admin) {
    //     whereCondition.active = true;
    //     whereCondition.deletedAt = null;
    // }

    // // Add filter conditions
    // // Alternative: Products.scope("lowCost").findAll()
    // if (request.params.maxPrice)
    //     whereCondition.price = {
    //         [Op.lt]: Number.parseInt(request.params.maxPrice)
    //     };

    // First retrieve total count
    Products
        .scope(request.session.user?.admin ? "admin" : undefined)
        .count({
            where: whereCondition
        })
        .then(async (number_) => {
            const cart = request.user ? await request.user.cartGet() : { id: undefined };
            paginationTotalItems = number_;
            // true search
            return Products
                // Only admin can see non-active and (soft) deleted products
                .scope(request.session.user?.admin ? "admin" : undefined)
                .findAll({
                    where: whereCondition,
                    offset: (paginationCurrentPage - 1) * paginationPageSize,
                    limit: paginationPageSize,
                    // this is only needed to get the quantity of the product in the cart (if any)
                    include: [{
                        model: CartItems,
                        required: false,
                        where: {
                            CartId: cart.id
                        },
                        attributes: ['quantity'],
                    }]
                })
        })
        .then((productListRaw) => {
            const productList = productListRaw.map(product => {
                // @ts-expect-error difficulties with sequelize inferred types

                const { quantity = 0 } = product.CartItems?.[0]?.dataValues ?? {};
                return {
                    ...product.dataValues,

                    quantity
                }
            });

            response.render('products/list', {
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
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
}