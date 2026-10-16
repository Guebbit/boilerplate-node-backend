/**
 * @module
 * GET /orders/:id/credit-notes — the list a client picks a download from. One row per refund that
 * settled on the order, `[]` for an order never refunded or one whose money the caller may not read, `404` for an order the caller cannot see.
 */

import type { Request, Response } from 'express';
import { invoicingService } from '../services';
import { presentCreditNoteSummary } from '../presenter';
import { successResponse } from '@infrastructure/http/response';
import { requireId } from '@infrastructure/http/ids';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';
import type { CreditNoteSummary } from '@types';

/** GET /orders/:id/credit-notes — non-admin callers see only their own order's; staff need the payments staff read. */
export const getOrderCreditNotes = (request: Request<{ id?: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'orders.not-found' });
    if (!id) return;

    return invoicingService
        .creditNotesForCaller(id, request.authContext, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<CreditNoteSummary[]>(
                response,
                result.data.map((note) => presentCreditNoteSummary(note)),
                200
            );
        })
        .catch(catchAs(response, 'getOrderCreditNotes'));
};
