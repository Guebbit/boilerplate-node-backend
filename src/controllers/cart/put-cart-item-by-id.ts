import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { t } from "i18next";
import { databaseErrorConverter } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { UpdateCartItemByIdRequest } from "@api/api";
import ProductRepository from "@repositories/products";
import UserService from "@services/users";

/**
 * Path parameters for cart item by productId
 */
export interface IUpdateCartItemParams {
    productId: string;
}

/**
 * Update cart item quantity by product ID
 * PUT /cart/:productId
 *
 * @param request
 * @param response
 * @param next
 */
export const putCartItemById = (
    request: Request<IUpdateCartItemParams, unknown, UpdateCartItemByIdRequest>,
    response: Response,
    next: NextFunction,
) =>
    ProductRepository.findOne({ _id: request.params.productId, active: true, deletedAt: undefined })
        .then((product) => {
            if (!product)
                return rejectResponse(response, 404, 'cart - product not found', [ t("ecommerce.product-not-found") ]);
            // isAuth ensures request.user is set
            return UserService.cartItemSet(request.user!, product, request.body.quantity)
                .then(({ data }) =>
                    successResponse(response, { cart: data?.cart })
                );
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
