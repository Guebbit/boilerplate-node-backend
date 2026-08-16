import type { Request, Response } from 'express';
import type { CastError } from 'mongoose';
import { successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { inventoryService } from '../service';

/**
 * GET /inventory/movements
 * The ledger, newest first — optionally one product's story via `?productId=`.
 */
export const getStockMovements = (request: Request, response: Response) => {
    const productId =
        typeof request.query.productId === 'string' && request.query.productId !== ''
            ? request.query.productId
            : undefined;

    return inventoryService
        .listMovements(productId)
        .then((result) => {
            successResponse(response, result.data);
        })
        .catch((error: CastError | Error) => {
            rejectDatabaseError(response, 'getStockMovements', error);
        });
};
