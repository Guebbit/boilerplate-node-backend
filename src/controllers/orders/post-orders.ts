import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { CreateOrderRequest } from '@types';
import { nodemailer } from "@utils/nodemailer";

/**
 * POST /orders
 * Create a new order from a payload (admin).
 */
const postOrders = (
    request: Request<unknown, unknown, CreateOrderRequest>,
    response: Response
) => {
    /**
     * Data validation
     */
    if (!request.body.userId || !request.body.email || !request.body.items?.length) {
        rejectResponse(response, 422, 'createOrder - invalid data', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    /**
     * Create a new order
     */
    return UserService.orderConfirm(request.user!).then(
        (result) => {
            if (!result.success) {
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }

            void nodemailer(
                {
                    to: request.user!.email,
                    subject: 'Order confirmed'
                },
                'email-order-confirm.ejs',
                {
                    ...response.locals,
                    pageMetaTitle: 'Order confirmed',
                    pageMetaLinks: [],
                    name: request.user!.username
                }
            );

            successResponse(response, result.data, 201);
        }
    );
};

export default postOrders;
