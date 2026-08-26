import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { t } from '@infrastructure/i18n';
import { AdjustStockBody } from '@api/schemas.zod';
import { inventoryService } from '../service';
import { catchAs, refused, rejectValidation } from '@infrastructure/http/controller';

/**
 * POST /inventory/adjustments
 * A stocktake correction. THE audited endpoint of this module: an unexplained stock correction is
 * precisely what shrinkage looks like from the outside, so the row records the admin, the signed
 * delta and the reason they typed.
 */
export const postAdjustment = (request: Request, response: Response) => {
    const parseResult = AdjustStockBody.safeParse(request.body ?? {});
    if (!parseResult.success) {
        rejectValidation(response, parseResult.error);
        return Promise.resolve();
    }

    const { productId, delta, note } = parseResult.data;
    /*
     * Zero is rejected here rather than in the contract, because `minimum`/`maximum` cannot
     * express "any integer except 0" and an `enum` of every other integer is absurd. A no-op
     * correction is refused rather than accepted-and-ignored: it would write a ledger row saying
     * nothing happened, which is exactly the kind of row that makes a ledger unreadable.
     */
    if (delta === 0) {
        rejectResponse(response, 422, [t('inventory.adjust-zero')]);
        return Promise.resolve();
    }

    return inventoryService
        .adjust(productId, delta, note, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, 200, result.message);
        })
        .catch(catchAs(response, 'postAdjustment'));
};
