/**
 * @module
 * The shop's own settings, published once. The boot gate is its config slice: the legal name,
 * address, email and phone are required (a withdrawal notice with no address on it is not one), and
 * so are the country and the time zone.
 *
 * See: docs/modules/shop.md
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { shopConfig } from './config';

/** This module's manifest entry: one public route, the identity config gate, no persistence. */
export default {
    name: 'shop',
    basePath: '/shop',
    routes: router,
    config: [shopConfig.slice],
    // No collection: everything here is the deployer's own configuration.
    personalData: 'none'
} satisfies AppModule;
