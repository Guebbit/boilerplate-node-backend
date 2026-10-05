/**
 * @module
 * `POST /cart/merge` controller — thin HTTP adapter over `cartService.cartMerge`.
 */

import type { Request, Response } from 'express';
import { MergeCartBody } from '@api/schemas.zod';
import { cartService } from '../services';
import { successResponse } from '@infrastructure/http/response';
import type { MergeCartRequest, MergeCartResponse } from '@types';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * POST /cart/merge
 * Fold a guest cart into the caller's cart. Always 200 once the body is valid: a line the cart
 * cannot take as asked is reported in `lines`, not failed, so the lines that fit still land.
 */
export const postCartMerge = (
    request: Request<unknown, unknown, MergeCartRequest>,
    response: Response
) => {
    const body = parseBody(MergeCartBody, request.body, response);
    if (!body) return;

    return cartService
        .cartMerge(request.authContext!.id, body.lines, callerContextOf(request))
        .then((result) => {
            successResponse<MergeCartResponse>(response, result);
        })
        .catch(catchAs(response, 'mergeCart'));
};
