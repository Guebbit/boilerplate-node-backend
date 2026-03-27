import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import ProductRepository from "@repositories/products";

import { databaseErrorConverter } from "@utils/error-helpers";
import type { UpsertCartItemRequest } from "@api/api";
import UserService from "@services/users";

/**
 * Add a product (with its quantity) to cart, check availability, etc
 * Create a CartItem row.
 *
 * @param request
 * @param response
 * @param next
 */
export const postSetCartItem = (request: Request<unknown, unknown, UpsertCartItemRequest>, response: Response, next: NextFunction) =>
    ProductRepository.findOne({ id: Number(request.body.productId), active: true, deletedAt: undefined })
        .then((product) => {
            // not found, something happened
            if (!product) {
                request.flash('error', [ t("ecommerce.product-not-found") ]);
                return;
            }
            request.flash('success', [ t("ecommerce.product-added-to-cart") ]);
            // check done before entering the route
            return UserService.cartItemSet(request.user!, product, request.body.quantity);
        })
        .then(() => response.redirect('/cart'))
        .catch((error: Error) => next(databaseErrorConverter(error)))