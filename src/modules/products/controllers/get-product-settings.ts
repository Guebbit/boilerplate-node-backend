/**
 * @module
 * Public controller for the catalogue's settings — today only the shop's currency. A thin adapter
 * from the module's config onto the standard success shape.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { productCurrency } from '../config';
import type { ProductSettingsResponse } from '@types';

/**
 * GET /products/settings
 * The one currency every price in this shop is quoted in — what a create form sizes its price
 * input from, before any product exists to carry a `currency` of its own.
 */
export const getProductSettings = (_request: Request, response: Response) => {
    successResponse<ProductSettingsResponse>(response, { currency: productCurrency() });
};
