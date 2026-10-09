/**
 * @module
 * The browsing-event relay: `POST /analytics/events`. A browser reports what the response cache
 * hides from the server (a product page opened, a search made), and the server hands it to the
 * analytics provider through the same consent gate every other event passes. Business facts (cart,
 * checkout, order, payment, signup, login) are never accepted here; they are emitted by the
 * service that makes them true.
 *
 * See: docs/modules/analytics.md
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: one public route, no persistence, no locales. */
export default {
    name: 'analytics',
    basePath: '/analytics',
    routes: router,
    // Stateless: an event is forwarded to the provider and kept nowhere in this app.
    personalData: 'none'
} satisfies AppModule;
