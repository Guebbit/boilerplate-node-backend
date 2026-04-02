import type { Request, Response } from 'express';
import { productService } from '@services/products';
import { rejectResponse, successResponse } from '@utils/response';
import type { SearchProductsRequest } from '@types';

export type IGetProductsQuery = Partial<Record<keyof SearchProductsRequest, string>>;

export const getProducts = (
    request: Request<{ page?: string }, unknown, SearchProductsRequest, IGetProductsQuery>,
    response: Response
) => {
    const page = request.body.page ?? request.query.page ?? '1';
    const pageSize =
        request.body.pageSize ??
        request.query.pageSize ??
        process.env.NODE_SETTINGS_PAGINATION_PAGE_SIZE ??
        '10';
    const minPrice =
        request.body.minPrice ?? request.query.minPrice
            ? Number(request.body.minPrice ?? request.query.minPrice)
            : undefined;
    const maxPrice =
        request.body.maxPrice ?? request.query.maxPrice
            ? Number(request.body.maxPrice ?? request.query.maxPrice)
            : undefined;

    return productService
        .search(
            {
                id: request.body.id ?? request.query.id,
                page: page ? Number(page) : undefined,
                pageSize: pageSize ? Number(pageSize) : undefined,
                text: request.body.text ?? request.query.text,
                minPrice,
                maxPrice
            },
            request.user?.admin === true
        )
        .then((result) => {
            successResponse(response, result);
        })
        .catch((error: Error) => {
            rejectResponse(response, 500, 'Unknown Error', [error.message]);
        });
};
