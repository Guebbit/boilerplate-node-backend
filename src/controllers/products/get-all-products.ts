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
 * @param req
 * @param res
 * @param next
 */
export default (req: Request & { params: IGetAllProductsParameters }, res: Response, next: NextFunction) => {
    // Empty where
    const whereCondition: WhereOptions = {};

    // current page
    const paginationCurrentPage = Number.parseInt(req.params.page ?? "1");
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
    //         [Op.lt]: Number.parseInt(req.params.maxPrice)
    //     };

    // First retrieve total count
    Products
        .scope(req.session.user?.admin ? "admin" : undefined)
        .count({
            where: whereCondition
        })
        .then(async (num) => {
            const cart = req.user ? await req.user.cartGet() : { id: undefined };
            paginationTotalItems = num;
            // true search
            return Products
                // Only admin can see non-active and (soft) deleted products
                .scope(req.session.user?.admin ? "admin" : undefined)
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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-member-access
                const { quantity = 0 } = product.CartItems?.[0]?.dataValues ?? {};
                return {
                    ...product.dataValues,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    quantity
                }
            });

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
        })
        .catch((error: Error | ValidationError | DatabaseError) => next(databaseErrorConverter(error)))
}