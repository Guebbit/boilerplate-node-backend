import type { Request, Response, NextFunction } from "express";
import { t } from "i18next";
import { nodemailer } from "@utils/nodemailer";
import { ExtendedError } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import UserService from "@services/users";

/**
 * Create a new order from the current user cart, then empty the cart
 * POST /cart/checkout
 *
 * @param request
 * @param response
 * @param next
 */
export const postOrder = (request: Request, response: Response, next: NextFunction) =>
    UserService.orderConfirm(request.user!)
        .then(({ success, data, errors = [] }) => {
            if (!success || !data)
                return rejectResponse(response, 409, 'checkout - failed', errors);

            // Order confirmation email (no need to wait)
            nodemailer({
                    to: request.user!.email,
                    subject: 'Order confirmed',
                },
                "email-order-confirm.ejs",
                {
                    pageMetaTitle: 'Order confirmed',
                    pageMetaLinks: [],
                    name: request.user!.username
                })
                .catch(() => { /* email failure is non-fatal */ });

            return successResponse(response, { order: data }, 201, t('ecommerce.order-creation-success'));
        })
        .catch(({ message }: Error) => next(new ExtendedError("500", 500, false, [ message ])));
