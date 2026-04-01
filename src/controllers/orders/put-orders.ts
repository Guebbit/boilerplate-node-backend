import type { Request, Response } from 'express';
import { t } from 'i18next';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderRequest } from '@types';

/**
 * PUT /orders
 * Update an order by id in the request body (admin).
 */
const putOrders = (
    request: Request<unknown, unknown, UpdateOrderRequest>,
    response: Response
) => {
    if (!request.body.id) {
        rejectResponse(response, 422, 'updateOrder - missing id', [
            t('generic.error-missing-data')
        ]);
        return Promise.resolve();
    }

    return OrderService.update(request.body.id, {
        ...request.body,
        status: request.body.status as string | undefined
    }).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }

        // This is just an order edit
        // void nodemailer(
        //     {
        //         to: request.user!.email,
        //         subject: 'Order confirmed'
        //     },
        //     'email-order-confirm.ejs',
        //     {
        //         ...response.locals,
        //         pageMetaTitle: 'Order confirmed',
        //         pageMetaLinks: [],
        //         name: request.user!.username
        //     }
        // );

        successResponse(response, result.data);
    });
};

export default putOrders;
