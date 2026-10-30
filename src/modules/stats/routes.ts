/**
 * @module
 * The `/stats` router: reads only, all behind `read:Stats`, none of them cached — the answer is
 * the shop's money. A session, not an API key: this is a dashboard, and a credential reaching a
 * sales figure is a decision nobody has made.
 *
 * See: docs/modules/stats.md
 */

import { Router } from 'express';
import { getAuth, isAuth, requirePermission } from '@kernel/middlewares/authorizations';
import { privateNoCache } from '@infrastructure/http/middlewares/cache';
import {
    getCategoryStats,
    getCustomerStats,
    getOperationsStats,
    getPaymentMixStats,
    getPipelineStats,
    getProductSalesSeries,
    getProductStats,
    getSalesStats
} from './controllers/get-stats';

/** Express router for the sales numbers. */
export const router = Router();

// `read:Stats` has no narrower sibling, so the plain guard is exact.
router.use(getAuth, isAuth, requirePermission('read', 'Stats'));

// `privateNoCache`: the browser may keep its own copy, revalidated every time; never a shared cache.
router.get('/sales', privateNoCache, getSalesStats);
router.get('/products', privateNoCache, getProductStats);
router.get('/products/:productId', privateNoCache, getProductSalesSeries);
router.get('/categories', privateNoCache, getCategoryStats);
router.get('/payments', privateNoCache, getPaymentMixStats);
router.get('/operations', privateNoCache, getOperationsStats);
router.get('/customers', privateNoCache, getCustomerStats);
router.get('/pipeline', privateNoCache, getPipelineStats);
