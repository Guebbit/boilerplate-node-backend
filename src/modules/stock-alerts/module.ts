/**
 * @module
 * Stock alerts: a signed-in buyer asks to be told once when a product they cannot order can be
 * again. Owns the requests and the one mail; `notifications` writes the inbox row from this
 * module's event, and `products` announces when a product is orderable again (an event, so this
 * module reaches `products` and not the other way round). Account erase covers the rows through
 * `personalData` below.
 *
 * See: docs/modules/stock-alerts.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { PRODUCT_BUYABLE_AGAIN, PRODUCT_DELETED } from '@modules/products';
import { stockAlertsJobs } from './jobs';
import { router } from './routes';
import { stockAlertService } from './service';

/** This module's manifest entry: routes, event subscriptions, personal data, locales, templates. */
export default {
    name: 'stock-alerts',
    basePath: '/stock-alerts',
    routes: router,
    jobs: stockAlertsJobs,
    personalData: [
        {
            section: 'stockAlerts',
            collect: (subject) => stockAlertService.exportRows(subject.userId),
            // Joins the caller's own hard-delete transaction.
            erase: stockAlertService.removeByUserId
        }
    ],
    subscribe: () => {
        onDomainEvent(PRODUCT_BUYABLE_AGAIN, ({ productId }) =>
            stockAlertService.onBuyableAgain(productId)
        );
        onDomainEvent(PRODUCT_DELETED, ({ productId }) =>
            stockAlertService.removeByProductId(productId)
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
