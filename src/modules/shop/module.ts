/**
 * @module
 * The shop's own settings, published once. The boot gate is its config slice: the time zone is
 * required, and so is the operator's phone, which `account` leaves optional (the withdrawal notice
 * prints it).
 *
 * @see docs/modules/shop.md#its-neighbourhood
 */

import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { shopConfig } from './config';

/** This module's manifest entry: one public route, the config gate, no persistence. */
export default {
    name: 'shop',
    mounts: [{ basePath: '/shop', routes: router }],
    languageNeutralReads: ['/shop'],
    config: [shopConfig.slice],
    /** No collection: everything here is the deployer's own configuration. */
    personalData: 'none'
} satisfies AppModule;
