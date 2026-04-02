/* eslint-disable unicorn/no-negated-condition */
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
    const minPriceRaw = request.body.minPrice ?? request.query.minPrice;
    const maxPriceRaw = request.body.maxPrice ?? request.query.maxPrice;
    const minPrice = minPriceRaw !== undefined ? Number(minPriceRaw) : undefined;
    const maxPrice = maxPriceRaw !== undefined ? Number(maxPriceRaw) : undefined;

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
