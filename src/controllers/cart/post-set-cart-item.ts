import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import ProductRepository from "@repositories/products";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { UpsertCartItemRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Add or set a product (with its quantity) in the cart.
 * POST /cart
 *
 * @param request
 * @param response
 * @param next
 */
export const postSetCartItem = (request: Request<unknown, unknown, UpsertCartItemRequest>, response: Response, next: NextFunction) =>
    ProductRepository.findOne({ _id: request.body.productId, active: true, deletedAt: undefined })
        .then((product) => {
            // not found, something happened
            if (!product)
                return rejectResponse(response, 404, 'cart - product not found', [ t("ecommerce.product-not-found") ]);
            // isAuth ensures request.user is set
            return UserService.cartItemSet(request.user!, product, request.body.quantity)
                .then(({ data }) =>
                    successResponse(response, { cart: data?.cart }, 200, t("ecommerce.product-added-to-cart"))
                );
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));