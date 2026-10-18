/**
 * @module
 * The sitemap route table. Public and unauthenticated: it publishes only addresses a stranger can
 * already open.
 */

import { Router } from 'express';
import { getSitemapIndex } from './controllers/get-sitemap-index';
import { getSitemapPages } from './controllers/get-sitemap-pages';
import { getSitemapProducts } from './controllers/get-sitemap-products';

/** Express router for the sitemap files. */
export const router = Router();

// GET /sitemap/index.xml
router.get('/index.xml', getSitemapIndex);

// GET /sitemap/pages.xml
router.get('/pages.xml', getSitemapPages);

// GET /sitemap/products-1.xml — the controller refuses anything but a positive whole number.
router.get('/products-:page.xml', getSitemapProducts);
