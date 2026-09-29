/**
 * @module
 * POST /returns
 * Open a return — and the EU withdrawal button, which is this same call with `reason:
 * withdrawal`. The answer depends on where the goods are: a return written (201, `Location`) once
 * they have shipped, or the order cancelled (200) when a withdrawal reaches it before dispatch.
 */

import type { Request, Response } from 'express';
import type { Order, Return } from '@types';
import { createdResponse, rejectResponse, successResponse } from '@infrastructure/http/response';
import { catchAs, parseBody } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import { CreateReturnBody } from '@api/schemas.zod';
import { t } from '@infrastructure/i18n';
import { returnService } from '../services';

/** Handles `POST /returns`. */
export const postReturn = (request: Request, response: Response) => {
    const body = parseBody(CreateReturnBody, request.body, response);
    if (!body) return;

    const { authContext } = request;
    // `isAuth` is mounted above this route, so a caller is always present here.
    if (!authContext) return;

    return returnService
        .createReturn(body, authContext, callerContextOf(request))
        .then((outcome) => {
            if (outcome.kind === 'refused') {
                rejectResponse(response, outcome.reject.status, outcome.reject.errors);
                return;
            }
            if (outcome.kind === 'cancelled') {
                successResponse<Order>(response, outcome.order, 200, t('returns.withdrawn'));
                return;
            }
            const created = returnService.withActions(outcome.created, authContext);
            createdResponse<Return>(
                response,
                created,
                `/returns/${created.id}`,
                t('returns.requested')
            );
        })
        .catch(catchAs(response, 'postReturn'));
};
