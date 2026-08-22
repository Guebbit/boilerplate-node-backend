import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { deliveryService } from '../service';

/**
 * GET /delivery/methods
 * The shipping methods this shop offers, flat rates and free-above thresholds included. Public:
 * a guest deciding whether to sign up deserves to know what shipping costs.
 */
export const getShippingMethods = (_request: Request, response: Response) => {
    const result = deliveryService.listMethods();
    successResponse(response, result.data);
};
