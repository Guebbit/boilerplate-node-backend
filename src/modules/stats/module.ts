/**
 * @module
 * Stats: the sales numbers behind the staff dashboard, composed on read from the modules that own
 * them — see `docs/modules/stats.md` for the definitions and why nothing is precomputed.
 *
 * Owns:        nothing stored. No collection, no cache.
 * Depends on:  `invoicing` (every money figure), `orders`, `payments` and `returns`, each through
 *              its own barrel, each answering already grouped.
 * Config:      none of its own; days follow `NODE_SHOP_TIMEZONE`, which `shop` owns.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry. */
export default {
    name: 'stats',
    basePath: '/stats',
    routes: router,
    // Nothing here is personal data: every figure is an aggregate, and a customer count is by account id.
    personalData: [],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
