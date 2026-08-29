/**
 * THE registry: which domains this build serves.
 *
 * Adding a domain is one folder under `src/modules/` plus one line here. Removing one is `rm -rf`
 * plus deleting its line — and if anything else breaks, that break is real coupling worth seeing
 * rather than a chore worth automating away.
 *
 * Order is not significant: routers mount under distinct base paths and dependencies are resolved
 * from `dependsOn`, not from position. Keep it alphabetical so diffs stay boring.
 *
 * A module that also ships its own `openapi.yaml` or `analytics.ts` needs one more line, in
 * `MODULE_SECTIONS` (`scripts/contracts/openapi-bundle.ts`) or `SECTIONS`
 * (`scripts/contracts/analytics-events-bundle.ts`) respectively — those files check themselves
 * against this list and the filesystem on every import, so forgetting either now throws instead of
 * shipping the module with a silently missing contract or catalogue entry.
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
