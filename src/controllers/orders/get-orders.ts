import type { Request, Response } from 'express';
import { orderService } from '@services/orders';
import { rejectResponse, successResponse } from '@utils/response';
import type { SearchOrdersRequest } from '@types';
import { userScope } from '@utils/helpers-scopes';

export type IGetOrdersQuery = Partial<Record<keyof SearchOrdersRequest, string>>;

export const getOrders = (
    request: Request<{ page?: string }, unknown, SearchOrdersRequest, IGetOrdersQuery>,
    response: Response
) => {
    const page = request.body.page ?? request.query.page ?? '1';
    const pageSize =
        request.body.pageSize ??
        request.query.pageSize ??
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ??
        '10';

    return orderService
        .search(
            {
                id: request.body.id ?? request.query.id,
                page: page ? Number(page) : undefined,
                pageSize: pageSize ? Number(pageSize) : undefined,
                userId: request.body.userId ?? request.query.userId,
                productId: request.body.productId ?? request.query.productId,
                email: request.body.email ?? request.query.email
            },
            userScope(request)
        )
        .then((result) => {
            successResponse(response, result);
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
