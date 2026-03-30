import type {Request, Response} from "express";
import {t} from "i18next";
import nodemailer from "../../utils/nodemailer";
import {databaseErrorInterpreter} from "../../utils/helpers-errors";
import type {CastError} from "mongoose";
import {rejectResponse, successResponse} from "../../utils/response";

/**
 * Create a new order
 * using the current user cart,
 * then empty the cart
 *
 * @param req
 * @param res
 */
export default async (req: Request, res: Response) => {
    await req.user!.orderConfirm()
        .then(({success, data, message, status}) => {
            if (!success)
                return rejectResponse(res, status, message);
            if (process.env.NODE_ENV !== "test")
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                nodemailer({
                        to: req.user!.email,
                        subject: 'Order confirmed',
                    },
                    "email-order-confirm.ejs",
                    {
                        ...res.locals,
                        pageMetaTitle: 'Order confirmed',
                        pageMetaLinks: [],
                        name: req.user!.username
                    });
            return successResponse(res, data, 200, t("ecommerce.order-creation-success"));
        })
        .catch((error: Error | CastError) => rejectResponse(res, ...databaseErrorInterpreter(error)))
}