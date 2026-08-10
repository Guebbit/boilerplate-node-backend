import { Router } from 'express';
import { getLocales, getLocaleDictionary } from '@controllers/locales/get-locales';
import { setCache } from '@middlewares/cache';

/**
 * Express router for locale discovery.
 *
 * Public and unauthenticated: this is static copy the API already sends to anyone who makes a
 * request, so there is nothing here to protect. Long-lived cache for the same reason — the
 * dictionaries change only on deploy.
 *
 * No `getAuth`, deliberately: an unauthenticated client that has just failed to reach the API
 * is exactly who needs the dictionary, and requiring a token would make it unavailable in the
 * one case it exists for.
 */
export const router = Router();

// GET /locales — which languages this deployment supports
router.get('/', setCache(3600, { tags: ['locales'], keyParameters: [] }), getLocales);

// GET /locales/:locale — that locale's dictionary, the API's own keys only
router.get(
    '/:locale',
    setCache(3600, { tags: ['locales'], keyParameters: [] }),
    getLocaleDictionary
);
