import type { Request, Response, NextFunction } from 'express';
import { Types, type CastError, type PipelineStage } from 'mongoose';
import { t } from 'i18next';
import { orderService } from '@services/orders';
import { databaseErrorConverter, ExtendedError } from '@utils/helpers-errors';

/**
 * Get target order info
 *
 * @param request
 * @param response
 * @param next
 */
export const getOrderItem = (
    request: Request<{ id?: string }>,
    response: Response,
    next: NextFunction
) => {
    // if it's not valid it could throw an error
    if (!Types.ObjectId.isValid(request.params.id ?? ''))
        return next(new ExtendedError('404', 404, true, [t('ecommerce.order-not-found')]));

    /**
     * User role filters:
     * Only admin can see all orders. Regular users can only see their own.
     */
    return orderService.getById(String(request.params.id), { userId: request.session.user?._id })
        .then((order) => {
            if (!order)
                return next(new ExtendedError('404', 404, true, [t('ecommerce.order-not-found')]));

            return response.render('orders/details', {
                pageMetaTitle: 'Order',
                pageMetaLinks: ['/css/order-details.css'],
                order
            });
        })
        .catch((error: CastError) => {
            if (error.message == '404' || error.kind === 'ObjectId')
                return next(new ExtendedError('404', 404, true, [t('ecommerce.order-not-found')]));
            return next(databaseErrorConverter(error));
        });
};
