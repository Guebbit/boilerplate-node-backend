/**
 * @module
 * The browsing events a product page reports through `POST /analytics/events`, and how each becomes
 * an analytics event. The request shapes are in `./openapi.browser-events.yaml`, which the bundler
 * folds into `analytics`' contract; this file is the matching half the relay calls.
 *
 * See: docs/modules/analytics.md
 */

import type { BrowserEventTarget } from '@kernel/registry';
import type { ProductViewedEvent, ProductsSearchedEvent } from '@types';
import { productsAnalyticsEvents } from './analytics';

/**
 * Properties keep the snake_case the provider's dashboards already use for these two names.
 * Registered on the manifest under the event name each request body carries.
 */
export const productsBrowserEvents = {
    [productsAnalyticsEvents.PRODUCT_VIEWED]: {
        toReport: (body: ProductViewedEvent) => ({
            event: productsAnalyticsEvents.PRODUCT_VIEWED,
            properties: { product_id: body.productId }
        })
    },
    [productsAnalyticsEvents.PRODUCTS_SEARCHED]: {
        toReport: (body: ProductsSearchedEvent) => ({
            event: productsAnalyticsEvents.PRODUCTS_SEARCHED,
            properties: { text: body.text, page: body.page, result_count: body.resultCount }
        })
    }
} satisfies Record<string, BrowserEventTarget>;
