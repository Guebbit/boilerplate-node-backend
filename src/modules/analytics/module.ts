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

import { resolveBrowserEvents, type AppModule } from '@kernel/registry';
import { router } from './routes';
import { registerBrowserEvents } from './services/relay';

/**
 * Once every enabled module is known, collect the browser events they declare — the relay cannot
 * import the modules that own them.
 *
 * @param modules - every enabled module, in registration order
 */
const onRegistered = (modules: readonly AppModule[]): void => {
    registerBrowserEvents(resolveBrowserEvents(modules));
};

/** This module's manifest entry: one public route, no persistence, no locales. */
export default {
    name: 'analytics',
    basePath: '/analytics',
    routes: router,
    onRegistered,
    // Stateless: an event is forwarded to the provider and kept nowhere in this app.
    personalData: 'none'
} satisfies AppModule;
