/**
 * @module
 * THE registry: which domains this build serves. Adding one is a folder under `src/modules/` plus
 * one line here; removing one is `rm -rf` plus deleting its line, and any resulting break is real
 * coupling worth seeing. Order is alphabetical only to keep diffs boring — mount order, import
 * resolution and `subscribe` timing don't depend on it. A module shipping its own `openapi.yaml`
 * needs a matching line in `MODULE_SECTIONS` (`scripts/contracts/openapi-bundle.ts`), which checks
 * itself against this list on every import.
 */

import type { AppModule } from '@kernel/registry';
import account from './modules/account/module';
import auditLogs from './modules/audit-logs/module';
import cart from './modules/cart/module';
import delivery from './modules/delivery/module';
import feedback from './modules/feedback/module';
import inventory from './modules/inventory/module';
import locales from './modules/locales/module';
import observability from './modules/observability/module';
import orders from './modules/orders/module';
import payments from './modules/payments/module';
import products from './modules/products/module';
import users from './modules/users/module';
import wishlist from './modules/wishlist/module';

export const enabledModules: AppModule[] = [
    account,
    auditLogs,
    cart,
    delivery,
    feedback,
    inventory,
    locales,
    observability,
    orders,
    payments,
    products,
    users,
    wishlist
];
