/**
 * @module
 * Controller for `GET /shop` — the one public read of the shop's own settings.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import type { Shop } from '@types';
import { getShop as readShop } from '../service';

/**
 * GET /shop (public)
 * Who the shop is, where it ships, where returns go and what it trades in. Public by design: the
 * seller must be identifiable before the sale, and the checkout needs the currency before it knows
 * the caller.
 */
export const getShop = (_request: Request, response: Response) =>
    Promise.resolve()
        .then(() => successResponse<Shop>(response, readShop()))
        .catch(catchAs(response, 'getShop'));
